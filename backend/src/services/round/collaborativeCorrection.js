import prisma from "../../lib/prisma.js";
import gameLock from "../../lib/asyncLock.js";
import env from "../../config/env.js";
import logger from "../../lib/logger.js";
import { conflict, forbidden, notFound } from "../../lib/errors.js";
import { roundParticipantRepository } from "../../repositories/roundRepository.js";
import answerRepository from "../../repositories/answerRepository.js";
import answerReviewRepository from "../../repositories/answerReviewRepository.js";
import { assertTransition, ROUND_STATUS } from "../../game/roundState.js";
import { PLAYER_STATUS } from "../../game/playerState.js";
import { isFilled } from "../../game/normalize.js";
import { assignReviews } from "../../game/reviewAssignment.js";
import { clearTimer, scheduleTimer } from "../../game/timers.js";
import * as realtime from "../../sockets/realtime.js";
import { lockKey, resolveRoom, getRoundOrFail, broadcastState } from "./shared.js";
import { openCorrection } from "./correction.js";

const collabTimerKey = (roundId) => `round:${roundId}:collab`;

/**
 * Agenda o fechamento automatico pelo prazo (spec 40). Exportada tambem
 * para `game/recovery.js` reagendar depois de um reinicio do servidor, a
 * partir do prazo ja persistido em `collaborativeCorrectionEndsAt`.
 */
export function scheduleCollaborativeCorrectionTimeout(roundId, delayMs) {
  scheduleTimer(collabTimerKey(roundId), delayMs, () =>
    closeCollaborativeCorrection(roundId).catch((error) =>
      logger.error(`Falha ao fechar a correção colaborativa da rodada ${roundId}`, error),
    ),
  );
}

/** Progresso agregado da correcao colaborativa (spec 36/39/42). */
export async function collaborativeCorrectionProgress(roundId) {
  const reviews = await answerReviewRepository.listByRound(roundId);
  const byGrader = new Map();
  for (const review of reviews) {
    const entry = byGrader.get(review.graderPlayerSessionId) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (review.decision !== "PENDING") entry.done += 1;
    byGrader.set(review.graderPlayerSessionId, entry);
  }
  const graders = [...byGrader.values()];
  return {
    totalGraders: graders.length,
    completedGraders: graders.filter((grader) => grader.done === grader.total).length,
    totalAssignments: reviews.length,
    completedAssignments: reviews.filter((review) => review.decision !== "PENDING").length,
  };
}

/**
 * Distribui as respostas preenchidas entre os alunos elegiveis (nunca a
 * propria, nunca repetida) e monta as linhas `AnswerReview` PENDING
 * correspondentes — mesmo padrao de `openCorrection` pre-criando respostas
 * em branco: existir a linha e o que sustenta o progresso "5/8" e a
 * checagem de duplicidade.
 */
function buildReviewAssignments(round, eligible, answers) {
  const filledByPlayer = new Map();
  for (const answer of answers) {
    if (!isFilled(answer.value)) continue;
    const list = filledByPlayer.get(answer.playerSessionId) ?? [];
    list.push({ id: answer.id });
    filledByPlayer.set(answer.playerSessionId, list);
  }

  const assignments = assignReviews(
    eligible.map((participant) => ({
      playerSessionId: participant.playerSessionId,
      answers: filledByPlayer.get(participant.playerSessionId) ?? [],
    })),
    env.collaborativeReviewCount,
  );

  const rows = [];
  for (const [graderPlayerSessionId, answerIds] of assignments) {
    for (const answerId of answerIds) {
      rows.push({ roundId: round.id, answerId, graderPlayerSessionId, decision: "PENDING" });
    }
  }

  return { assignments, rows };
}

/**
 * Avisa cada avaliador do que foi atribuido a ele. Anonimo por desenho
 * (spec 10): so o id da avaliacao, a categoria e o valor da resposta —
 * nunca o autor.
 */
async function notifyGraders(round, assignments) {
  for (const [graderPlayerSessionId, answerIds] of assignments) {
    if (answerIds.length === 0) continue;
    const assigned = await answerReviewRepository.listByGrader(round.id, graderPlayerSessionId);
    realtime.toPlayer(graderPlayerSessionId, "reviewAssigned", {
      roundId: round.id,
      reviews: assigned.map((review) => ({
        reviewId: review.id,
        roundCategoryId: review.answer.roundCategoryId,
        categoryName: review.answer.roundCategory.name,
        value: review.answer.value,
      })),
    });
  }
}

/**
 * Abre a fase de correcao colaborativa (spec 8-14).
 *
 * Chamada por `finalizeRound` logo apos STOPPED. `skipLock` porque
 * `finalizeRound` ja roda dentro da trava da rodada (mesmo padrao de
 * `openCorrection`).
 */
export async function startCollaborativeCorrection(round, { skipLock = false } = {}) {
  const run = async () => {
    const fresh = await getRoundOrFail(round.id);
    if (
      fresh.status === ROUND_STATUS.COLLABORATIVE_CORRECTION ||
      fresh.status === ROUND_STATUS.CORRECTION
    ) {
      return fresh;
    }
    if (fresh.status !== ROUND_STATUS.STOPPED) {
      throw conflict(`Não é possível iniciar a correção colaborativa no estado ${fresh.status}`);
    }

    const participants = await roundParticipantRepository.listByRound(round.id);
    const eligible = participants.filter((participant) => participant.status !== PLAYER_STATUS.ELIMINATED);
    const answers = await answerRepository.listByRound(round.id);
    const { assignments, rows } = buildReviewAssignments(round, eligible, answers);

    assertTransition(fresh.status, ROUND_STATUS.COLLABORATIVE_CORRECTION);
    const collaborativeCorrectionEndsAt =
      rows.length > 0 ? new Date(Date.now() + env.collaborativeCorrectionDurationSeconds * 1000) : null;
    await prisma.round.update({
      where: { id: round.id },
      data: { status: ROUND_STATUS.COLLABORATIVE_CORRECTION, collaborativeCorrectionEndsAt },
    });
    if (rows.length > 0) await answerReviewRepository.createMany(rows);

    if (rows.length === 0) {
      // Ninguem tem o que corrigir (partida solo, ou ninguem respondeu
      // nada nesta rodada): nao ha por que segurar a fase — avanca direto
      // para a correcao do professor.
      return closeCollaborativeCorrection(round.id, { skipLock: true });
    }

    const updated = await getRoundOrFail(round.id);
    const room = await resolveRoom(round.gameId);

    await notifyGraders(round, assignments);

    realtime.toRoom(room.code, "collaborativeCorrectionStarted", {
      roundId: round.id,
      status: updated.status,
      collaborativeCorrectionEndsAt: updated.collaborativeCorrectionEndsAt,
      ...(await collaborativeCorrectionProgress(round.id)),
    });
    await broadcastState(room.code);

    scheduleCollaborativeCorrectionTimeout(round.id, collaborativeCorrectionEndsAt.getTime() - Date.now());

    return updated;
  };

  return skipLock ? run() : gameLock.run(lockKey(round.id), run);
}

/**
 * Aluno registra a decisao sobre uma resposta atribuida (spec 9-16, 37,
 * 45). O cliente so envia `reviewId` e `decision` — nunca `roundId`,
 * `answerId` ou `graderStudentId`: o servidor ja sabe tudo isso a partir
 * da propria atribuicao (spec 45). Nunca a propria resposta (garantido na
 * distribuicao); nunca duas vezes (`claimDecision` so grava se ainda
 * estiver PENDING — impede reenvio e corrida entre duas abas do mesmo
 * aluno).
 */
export async function submitReview({ playerSessionId, reviewId, decision }) {
  const review = await answerReviewRepository.findById(reviewId);
  if (!review) throw notFound("Avaliação não encontrada");
  const roundId = review.roundId;

  return gameLock.run(lockKey(roundId), async () => {
    const round = await getRoundOrFail(roundId);
    if (round.status !== ROUND_STATUS.COLLABORATIVE_CORRECTION) {
      throw conflict("A correção colaborativa não está em andamento");
    }

    const fresh = await answerReviewRepository.findById(reviewId);
    if (!fresh) throw notFound("Avaliação não encontrada");
    if (fresh.graderPlayerSessionId !== playerSessionId) {
      throw forbidden("Esta avaliação não foi atribuída a você");
    }
    if (fresh.decision !== "PENDING") {
      throw conflict("Esta avaliação já foi enviada");
    }

    const claimed = await answerReviewRepository.claimDecision(reviewId, decision);
    if (claimed.count === 0) throw conflict("Esta avaliação já foi enviada");

    const progress = await collaborativeCorrectionProgress(roundId);
    const room = await resolveRoom(round.gameId);
    realtime.toPlayer(playerSessionId, "reviewCompleted", { roundId, reviewId, decision });
    realtime.toTeachers(room.code, "collaborativeCorrectionProgress", { roundId, ...progress });
    realtime.toScreens(room.code, "collaborativeCorrectionProgress", { roundId, ...progress });

    if (progress.completedAssignments >= progress.totalAssignments) {
      // Todo mundo ja terminou: nao ha por que esperar o timer (spec 39).
      await closeCollaborativeCorrection(roundId, { skipLock: true });
    }

    return { reviewId, decision, ...progress };
  });
}

/**
 * Fecha a fase de correcao colaborativa e abre a correcao oficial do
 * professor (spec 25, 38-40). Idempotente: chamar de novo depois que a
 * rodada ja avancou so devolve o estado atual (mesmo padrao de
 * `openCorrection`). Disparada pelo prazo configurado, por todo mundo ja
 * ter terminado, ou pelo professor a qualquer momento ("FINALIZAR
 * CORREÇÃO", spec 39) — nenhum aluno pendente bloqueia a partida.
 */
export async function closeCollaborativeCorrection(roundId, { skipLock = false } = {}) {
  const run = async () => {
    clearTimer(collabTimerKey(roundId));
    const round = await getRoundOrFail(roundId);
    if (round.status !== ROUND_STATUS.COLLABORATIVE_CORRECTION) return round;

    const room = await resolveRoom(round.gameId);
    realtime.toRoom(room.code, "collaborativeCorrectionFinished", { roundId });

    return openCorrection(roundId, { skipLock: true });
  };

  return skipLock ? run() : gameLock.run(lockKey(roundId), run);
}
