import prisma from "../../lib/prisma.js";
import gameLock from "../../lib/asyncLock.js";
import env from "../../config/env.js";
import { conflict } from "../../lib/errors.js";
import roundRepository, { roundParticipantRepository } from "../../repositories/roundRepository.js";
import answerRepository from "../../repositories/answerRepository.js";
import answerReviewRepository from "../../repositories/answerReviewRepository.js";
import { assertTransition, ROUND_STATUS } from "../../game/roundState.js";
import { PLAYER_STATUS } from "../../game/playerState.js";
import { isFilled, matchesLetter } from "../../game/normalize.js";
import { scoreAnswers, suggestReviewState, REVIEW_STATE } from "../../game/scoring.js";
import * as realtime from "../../sockets/realtime.js";
import viewService from "../viewService.js";
import { lockKey, resolveRoom, getRoundOrFail, broadcastState } from "./shared.js";

/** Categorias obrigatorias ainda sem resposta preenchida (spec 11). */
export async function missingRequiredCategories(round, playerSessionId) {
  const required = round.categories.filter((category) => category.required);
  if (required.length === 0) return [];
  const answers = await answerRepository.listByPlayer(round.id, playerSessionId);
  const filled = new Set(
    answers.filter((answer) => isFilled(answer.value)).map((answer) => answer.roundCategoryId),
  );
  return required.filter((category) => !filled.has(category.id));
}

/**
 * Materializa a grade de correcao: garante uma linha por aluno elegivel
 * e categoria, com sugestao automatica de estado (spec 18/19/21).
 */
export async function openCorrection(roundId, { skipLock = false } = {}) {
  const run = async () => {
    const round = await getRoundOrFail(roundId);
    if (round.status === ROUND_STATUS.CORRECTION) return round;
    if (round.status !== ROUND_STATUS.COLLABORATIVE_CORRECTION) {
      throw conflict(`Não é possível corrigir uma rodada no estado ${round.status}`);
    }

    const participants = await roundParticipantRepository.listByRound(roundId);
    const eligible = participants.filter(
      (participant) => participant.status !== PLAYER_STATUS.ELIMINATED,
    );
    const existing = await answerRepository.listByRound(roundId);
    const byKey = new Map(
      existing.map((answer) => [`${answer.playerSessionId}:${answer.roundCategoryId}`, answer]),
    );

    const creates = [];
    const updates = [];
    for (const participant of eligible) {
      for (const category of round.categories) {
        const key = `${participant.playerSessionId}:${category.id}`;
        const answer = byKey.get(key);
        if (!answer) {
          creates.push({
            roundId,
            playerSessionId: participant.playerSessionId,
            roundCategoryId: category.id,
            value: "",
            normalizedValue: "",
            reviewState: REVIEW_STATE.BLANK,
          });
          continue;
        }
        if (answer.reviewState !== REVIEW_STATE.PENDING) continue;
        const suggested = suggestReviewState(answer.value, round.letter, round.letterRule);
        // Respostas coerentes com a letra ja entram como validas; o
        // professor ajusta o que estiver semanticamente errado.
        updates.push({
          id: answer.id,
          reviewState: suggested === REVIEW_STATE.PENDING ? REVIEW_STATE.VALID : suggested,
        });
      }
    }

    if (creates.length > 0) await prisma.answer.createMany({ data: creates, skipDuplicates: true });
    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((update) =>
          prisma.answer.update({ where: { id: update.id }, data: { reviewState: update.reviewState } }),
        ),
      );
    }

    assertTransition(round.status, ROUND_STATUS.CORRECTION);
    await roundRepository.transitionIfStatus(roundId, ROUND_STATUS.COLLABORATIVE_CORRECTION, {
      status: ROUND_STATUS.CORRECTION,
    });

    const updated = await getRoundOrFail(roundId);
    const room = await resolveRoom(round.gameId);
    realtime.toRoom(room.code, "correctionStarted", { roundId, status: updated.status });
    // Sem isso o `round.status` que o professor/aluno/tela publica tem em
    // cache local nunca avanca para CORRECTION: `correctionStarted` sozinho
    // so aciona o carregamento da grade (loadGrid no professor), nao
    // atualiza o `roomState` que os tres tipos de cliente guardam — o
    // botao "Pontuar rodada" (gated em round.status) nunca apareceria.
    await broadcastState(room.code);
    return updated;
  };

  return skipLock ? run() : gameLock.run(lockKey(roundId), run);
}

/** Pontua cada resposta e devolve o total base (sem bonus) por jogador. */
function scoreParticipantAnswers(answers, scoreable) {
  const scored = scoreAnswers(scoreable);

  const answerUpdates = answers.map((answer) => {
    const entry = scored.get(answer.id);
    const points = entry?.score ?? 0;
    return prisma.answer.update({
      where: { id: answer.id },
      data: { score: points, isValid: points > 0 },
    });
  });

  const totals = new Map();
  for (const answer of scoreable) {
    const entry = scored.get(answer.id);
    totals.set(
      answer.playerSessionId,
      (totals.get(answer.playerSessionId) ?? 0) + (entry?.score ?? 0),
    );
  }

  return { scored, answerUpdates, totals };
}

/**
 * Bonus da correcao colaborativa (spec 27-31): decisao do aluno igual a
 * decisao oficial do professor concede COLLABORATIVE_REVIEW_BONUS,
 * independente da pontuacao das proprias respostas do aluno (spec 29).
 */
function collaborativeBonusByGrader(reviews, scored) {
  const reviewStatsByGrader = new Map();
  for (const review of reviews) {
    if (review.decision === "PENDING") continue;
    const stats = reviewStatsByGrader.get(review.graderPlayerSessionId) ?? { total: 0, matches: 0 };
    stats.total += 1;
    const officialIsValid = (scored.get(review.answerId)?.score ?? 0) > 0;
    const matched =
      (review.decision === "VALID" && officialIsValid) ||
      (review.decision === "INVALID" && !officialIsValid);
    if (matched) stats.matches += 1;
    reviewStatsByGrader.set(review.graderPlayerSessionId, stats);
  }
  for (const stats of reviewStatsByGrader.values()) stats.bonus = stats.matches * env.collaborativeReviewBonus;
  return reviewStatsByGrader;
}

/** Monta as escritas de `RoundParticipant.roundScore` e `Score.total` a partir dos totais já calculados. */
function buildScorePersistence(round, participants, totals) {
  const participantUpdates = participants.map((participant) =>
    prisma.roundParticipant.update({
      where: { id: participant.id },
      data: { roundScore: totals.get(participant.playerSessionId) ?? 0 },
    }),
  );

  const scoreUpdates = participants.map((participant) =>
    prisma.score.upsert({
      where: {
        gameId_studentId: {
          gameId: round.gameId,
          studentId: participant.playerSession.studentId,
        },
      },
      update: { total: { increment: totals.get(participant.playerSessionId) ?? 0 } },
      create: {
        gameId: round.gameId,
        studentId: participant.playerSession.studentId,
        total: totals.get(participant.playerSessionId) ?? 0,
      },
    }),
  );

  return [...participantUpdates, ...scoreUpdates];
}

/** Aplica a pontuacao 10/5/0 e atualiza o ranking (spec 19 e 42). */
export async function score(roundId) {
  return gameLock.run(lockKey(roundId), async () => {
    const round = await getRoundOrFail(roundId);
    if (round.status !== ROUND_STATUS.CORRECTION) {
      throw conflict(`Não é possível pontuar uma rodada no estado ${round.status}`);
    }

    const participants = await roundParticipantRepository.listByRound(roundId);
    const eliminated = new Set(
      participants
        .filter((participant) => participant.status === PLAYER_STATUS.ELIMINATED)
        .map((participant) => participant.playerSessionId),
    );

    const answers = await answerRepository.listByRound(roundId);
    const scoreable = answers.filter((answer) => !eliminated.has(answer.playerSessionId));
    const { scored, answerUpdates, totals } = scoreParticipantAnswers(answers, scoreable);

    const reviews = await answerReviewRepository.listByRound(roundId);
    const reviewStatsByGrader = collaborativeBonusByGrader(reviews, scored);
    for (const [graderPlayerSessionId, stats] of reviewStatsByGrader) {
      totals.set(graderPlayerSessionId, (totals.get(graderPlayerSessionId) ?? 0) + stats.bonus);
    }

    assertTransition(round.status, ROUND_STATUS.SCORED);
    await prisma.$transaction([
      ...answerUpdates,
      ...buildScorePersistence(round, participants, totals),
      prisma.round.updateMany({
        where: { id: roundId, status: ROUND_STATUS.CORRECTION },
        data: { status: ROUND_STATUS.SCORED, scoredAt: new Date() },
      }),
    ]);

    const room = await resolveRoom(round.gameId);
    const ranking = await viewService.loadRanking(round.gameId);
    realtime.toRoom(room.code, "scoreUpdated", {
      roundId,
      results: participants.map((participant) => {
        const stats = reviewStatsByGrader.get(participant.playerSessionId);
        return {
          playerSessionId: participant.playerSessionId,
          name: participant.playerSession.student.name,
          roundScore: totals.get(participant.playerSessionId) ?? 0,
          eliminated: eliminated.has(participant.playerSessionId),
          // Detalhe da correcao colaborativa para a tela de resultado
          // (spec 31) — ausente quando o aluno nao avaliou ninguem.
          collaborativeReview: stats
            ? { totalReviews: stats.total, matchingReviews: stats.matches, bonus: stats.bonus }
            : null,
        };
      }),
    });
    realtime.toRoom(room.code, "rankingUpdated", { ranking });
    await broadcastState(room.code);
    return { round: await getRoundOrFail(roundId), ranking };
  });
}

/** Grade de correcao para o painel do professor (spec 18). */
export async function correctionGrid(roundId) {
  const round = await getRoundOrFail(roundId);
  const participants = await roundParticipantRepository.listByRound(roundId);
  const answers = await answerRepository.listByRound(roundId);

  const byPlayer = new Map();
  for (const answer of answers) {
    const list = byPlayer.get(answer.playerSessionId) ?? [];
    list.push(answer);
    byPlayer.set(answer.playerSessionId, list);
  }

  // Sinaliza repeticoes para o professor sem decidir por ele.
  const duplicates = new Map();
  for (const answer of answers) {
    if (!answer.normalizedValue) continue;
    const key = `${answer.roundCategoryId}::${answer.normalizedValue}`;
    duplicates.set(key, (duplicates.get(key) ?? 0) + 1);
  }

  return {
    round: viewService.roundSummary(round),
    categories: round.categories.map((category) => ({
      id: category.id,
      name: category.name,
      required: category.required,
      order: category.order,
    })),
    players: participants
      .filter((participant) => participant.status !== PLAYER_STATUS.ELIMINATED)
      .map((participant) => ({
        playerSessionId: participant.playerSessionId,
        name: participant.playerSession.student.name,
        registrationNumber: participant.playerSession.student.registrationNumber,
        status: participant.status,
        roundScore: participant.roundScore,
        answers: (byPlayer.get(participant.playerSessionId) ?? []).map((answer) => ({
          id: answer.id,
          roundCategoryId: answer.roundCategoryId,
          value: answer.value,
          normalizedValue: answer.normalizedValue,
          reviewState: answer.reviewState,
          score: answer.score,
          matchesLetter: matchesLetter(answer.normalizedValue, round.letter, round.letterRule),
          duplicated:
            (duplicates.get(`${answer.roundCategoryId}::${answer.normalizedValue}`) ?? 0) > 1,
        })),
      })),
    eliminated: participants
      .filter((participant) => participant.status === PLAYER_STATUS.ELIMINATED)
      .map((participant) => ({
        playerSessionId: participant.playerSessionId,
        name: participant.playerSession.student.name,
        reason: participant.eliminationReason,
      })),
  };
}

/**
 * Correcao agregada por resposta distinta (spec 17/20/21/52): em vez de
 * "40 alunos × 8 categorias" como 320 itens independentes, agrupa
 * respostas iguais (mesmo `normalizedValue` — a mesma chave ja usada para
 * detectar duplicata em `correctionGrid`, aqui reaproveitada em vez de
 * recalculada) para que o professor corrija cada resposta distinta uma
 * unica vez. Ordenado por frequencia decrescente, depois alfabetica.
 */
export async function groupedCorrectionGrid(roundId) {
  const round = await getRoundOrFail(roundId);
  const participants = await roundParticipantRepository.listByRound(roundId);
  const eligibleIds = new Set(
    participants
      .filter((participant) => participant.status !== PLAYER_STATUS.ELIMINATED)
      .map((participant) => participant.playerSessionId),
  );
  const answers = (await answerRepository.listByRound(roundId)).filter((answer) =>
    eligibleIds.has(answer.playerSessionId),
  );

  const byCategory = new Map();
  for (const category of round.categories) byCategory.set(category.id, new Map());

  for (const answer of answers) {
    const groups = byCategory.get(answer.roundCategoryId);
    if (!groups) continue;
    const key = answer.normalizedValue || "";
    const group = groups.get(key) ?? {
      normalizedValue: key,
      value: answer.value,
      answerIds: [],
      reviewStates: new Set(),
      matchesLetter: matchesLetter(key, round.letter, round.letterRule),
    };
    group.answerIds.push(answer.id);
    group.reviewStates.add(answer.reviewState);
    groups.set(key, group);
  }

  const categories = round.categories.map((category) => {
    const groups = [...byCategory.get(category.id).values()]
      .map((group) => ({
        normalizedValue: group.normalizedValue,
        value: group.value,
        count: group.answerIds.length,
        answerIds: group.answerIds,
        matchesLetter: group.matchesLetter,
        // Uma unica marcacao representa o grupo inteiro so quando todas as
        // respostas do grupo ja compartilham o mesmo estado (ex.: recem
        // sugerido automaticamente); caso contrario o professor ve MISTO.
        reviewState: group.reviewStates.size === 1 ? [...group.reviewStates][0] : "MIXED",
      }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "pt-BR"));
    return {
      id: category.id,
      name: category.name,
      required: category.required,
      order: category.order,
      groups,
    };
  });

  return { round: viewService.roundSummary(round), categories };
}
