import prisma from "../lib/prisma.js";
import env from "../config/env.js";
import gameLock from "../lib/asyncLock.js";
import logger from "../lib/logger.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import roundRepository, { roundParticipantRepository } from "../repositories/roundRepository.js";
import answerRepository from "../repositories/answerRepository.js";
import gameRepository from "../repositories/gameRepository.js";
import roomRepository from "../repositories/roomRepository.js";
import telemetryRepository from "../repositories/telemetryRepository.js";
import { categorySetRepository } from "../repositories/categoryRepository.js";
import { drawLetter } from "../game/letters.js";
import { assertTransition, ROUND_STATUS, PLAYER_STATUS } from "../game/roundState.js";
import { normalizeAnswer, isFilled } from "../game/normalize.js";
import { scoreAnswers, suggestReviewState, REVIEW_STATE } from "../game/scoring.js";
import { clearRoundTimer, scheduleRoundEnd } from "../game/timers.js";
import * as realtime from "../sockets/realtime.js";
import viewService from "./viewService.js";

const lockKey = (roundId) => `round:${roundId}`;

async function resolveRoom(gameId) {
  const rooms = await roomRepository.listByGame(gameId);
  const open = rooms.find((room) => room.status === "OPEN") ?? rooms[0];
  if (!open) throw badRequest("A partida ainda não possui sala");
  return open;
}

async function getRoundOrFail(roundId) {
  const round = await roundRepository.findById(roundId);
  if (!round) throw notFound("Rodada não encontrada");
  return round;
}

/**
 * Envia o estado atualizado para painel do professor, tela publica e cada
 * aluno da sala.
 *
 * Sem isso, o cliente do aluno so recebe o estado da rodada (incluindo o
 * `endsAt` do cronometro) no momento em que entra na sala: eventos como
 * "a rodada comecou" chegam nomeados, mas nada atualiza o estado
 * compartilhado do React caso o handler nao trate o payload explicitamente.
 * Reenviar aqui garante que todos os clientes fiquem consistentes com o
 * servidor sempre que algo relevante mudar (spec 33 e 45).
 */
async function broadcastState(roomCode) {
  try {
    const [teacher, publicView] = await Promise.all([
      viewService.teacherState(roomCode),
      viewService.publicState(roomCode),
    ]);
    realtime.toTeachers(roomCode, "roomState", teacher);
    realtime.toScreens(roomCode, "roomState", publicView);

    // Cada aluno recebe apenas o proprio estado (spec 49): mesma rodada,
    // nunca as respostas de outro colega.
    await Promise.all(
      teacher.players.map(async (player) => {
        try {
          const playerState = await viewService.playerState(player.playerSessionId);
          realtime.toPlayer(player.playerSessionId, "roomState", playerState);
        } catch (error) {
          logger.warn(
            `Falha ao atualizar estado do aluno ${player.playerSessionId}`,
            error?.message ?? error,
          );
        }
      }),
    );
  } catch (error) {
    logger.warn("Falha ao difundir estado da sala", error?.message ?? error);
  }
}

export const roundService = {
  broadcastState,
  resolveRoom,

  /**
   * Cria a rodada e copia as categorias do conjunto escolhido.
   * A copia impede que alteracoes futuras no cadastro alterem uma partida
   * ja realizada (spec 17).
   */
  async create({ gameId, categorySetId, durationSeconds, themeName }) {
    const set = await categorySetRepository.findById(categorySetId);
    if (!set) throw badRequest("Conjunto de categorias inexistente");
    const categories = set.categories.filter((category) => category.active);
    if (categories.length === 0) throw badRequest("O conjunto não possui categorias ativas");

    const current = await roundRepository.findCurrentByGame(gameId);
    if (current && current.status !== ROUND_STATUS.FINISHED) {
      throw conflict("Já existe uma rodada em andamento. Encerre-a antes de criar outra.", {
        roundId: current.id,
        status: current.status,
      });
    }

    const roundNumber = (await gameRepository.lastRoundNumber(gameId)) + 1;
    const round = await roundRepository.create({
      gameId,
      roundNumber,
      categorySetId,
      themeName: themeName ?? set.name,
      letter: "",
      durationSeconds: durationSeconds ?? env.defaultRoundDuration,
      status: ROUND_STATUS.CREATED,
    });

    await roundRepository.createCategories(round.id, categories);

    // Novo round: eliminacoes anteriores nao valem mais (spec 27).
    const room = await resolveRoom(gameId);
    await prisma.playerSession.updateMany({
      where: { roomId: room.id, status: { in: ["PLAYING", "SUBMITTED", "ELIMINATED", "FINISHED"] } },
      data: { status: PLAYER_STATUS.READY },
    });

    await prisma.game.updateMany({
      where: { id: gameId, status: "CREATED" },
      data: { status: "ACTIVE", startedAt: new Date() },
    });

    const created = await getRoundOrFail(round.id);
    realtime.toRoom(room.code, "roundCreated", {
      round: { ...viewService.roundSummary(created), letter: null },
    });
    await broadcastState(room.code);
    return created;
  },

  /** Sorteio da letra: sempre no servidor (spec 15/16). */
  async drawRoundLetter(roundId) {
    return gameLock.run(lockKey(roundId), async () => {
      const round = await getRoundOrFail(roundId);
      if (round.status !== ROUND_STATUS.CREATED && round.status !== ROUND_STATUS.READY) {
        throw conflict(`Não é possível sortear a letra no estado ${round.status}`);
      }

      const usedLetters = (await gameRepository.usedLetters(round.gameId)).filter(Boolean);
      const { letter, poolRestarted } = drawLetter({ pool: env.letterPool, usedLetters });

      if (round.status === ROUND_STATUS.CREATED) {
        assertTransition(round.status, ROUND_STATUS.READY);
      }
      const updated = await roundRepository.update(roundId, {
        letter,
        status: ROUND_STATUS.READY,
      });

      const room = await resolveRoom(round.gameId);
      realtime.toRoom(room.code, "letterSelected", {
        roundId,
        letter,
        poolRestarted,
        themeName: updated.themeName,
        roundNumber: updated.roundNumber,
      });
      await broadcastState(room.code);
      return { round: updated, poolRestarted, usedLetters: [...usedLetters, letter] };
    });
  },

  /** Inicia a rodada e liga o cronometro autoritativo (spec 14/33). */
  async start(roundId) {
    return gameLock.run(lockKey(roundId), async () => {
      const round = await getRoundOrFail(roundId);
      if (!round.letter) throw badRequest("Sorteie a letra antes de iniciar a rodada");
      assertTransition(round.status, ROUND_STATUS.STARTING);

      const room = await resolveRoom(round.gameId);
      const sessions = await prisma.playerSession.findMany({
        where: { roomId: room.id },
        select: { id: true },
      });
      if (sessions.length === 0) throw badRequest("Nenhum aluno conectado à sala");

      const startedAt = new Date();
      const endsAt = new Date(startedAt.getTime() + round.durationSeconds * 1000);

      const claimed = await roundRepository.transitionIfStatus(roundId, ROUND_STATUS.READY, {
        status: ROUND_STATUS.PLAYING,
        startedAt,
        endsAt,
      });
      if (claimed.count === 0) throw conflict("A rodada já foi iniciada");

      await roundParticipantRepository.createMany(
        roundId,
        sessions.map((session) => session.id),
        PLAYER_STATUS.PLAYING,
      );
      await roundParticipantRepository.updateManyStatus(
        roundId,
        [PLAYER_STATUS.WAITING, PLAYER_STATUS.READY, PLAYER_STATUS.FINISHED],
        { status: PLAYER_STATUS.PLAYING, eliminatedAt: null, eliminationReason: null },
      );
      await prisma.playerSession.updateMany({
        where: { roomId: room.id },
        data: { status: PLAYER_STATUS.PLAYING },
      });

      scheduleRoundEnd(roundId, endsAt.getTime() - Date.now(), () =>
        roundService.handleTimeout(roundId),
      );

      const updated = await getRoundOrFail(roundId);
      realtime.toRoom(room.code, "roundStarted", {
        round: viewService.roundSummary(updated),
        serverTime: new Date().toISOString(),
      });
      await broadcastState(room.code);
      await telemetryRepository.record({
        type: "ROUND_STARTED",
        roomId: room.id,
        roundId,
        payload: { players: sessions.length },
      });
      return updated;
    });
  },

  /**
   * STOP solicitado por um aluno (spec 11, 12 e 13).
   * Toda a validacao ocorre no servidor; a corrida e resolvida por um
   * UPDATE condicional atomico.
   */
  async requestStop({ roundId, playerSessionId }) {
    return gameLock.run(lockKey(roundId), async () => {
      const round = await getRoundOrFail(roundId);

      if (round.status !== ROUND_STATUS.PLAYING) {
        throw conflict("A rodada não está em andamento");
      }
      if (round.endsAt && round.endsAt.getTime() <= Date.now()) {
        // O tempo acabou antes deste STOP: encerra por timeout (spec 14).
        await roundService.finalizeRound(round, { reason: "TIMEOUT" });
        throw conflict("O tempo da rodada terminou");
      }

      const participant = await roundParticipantRepository.find(roundId, playerSessionId);
      if (!participant) throw forbidden("Você não participa desta rodada");
      if (participant.status === PLAYER_STATUS.ELIMINATED) {
        throw forbidden("Você foi eliminado desta rodada");
      }
      if (participant.status !== PLAYER_STATUS.PLAYING) {
        throw forbidden("Você não está elegível para pressionar STOP");
      }

      const missing = await roundService.missingRequiredCategories(round, playerSessionId);
      if (missing.length > 0) {
        throw badRequest("Preencha todas as categorias obrigatórias antes do STOP", {
          missing: missing.map((category) => ({ id: category.id, name: category.name })),
        });
      }

      const stoppedAt = new Date();
      const claimed = await roundRepository.transitionIfStatus(roundId, ROUND_STATUS.PLAYING, {
        status: ROUND_STATUS.STOPPED,
        stoppedAt,
        firstStopperId: playerSessionId,
        stopReason: "STOP",
      });
      if (claimed.count === 0) {
        throw conflict("Outro aluno pressionou STOP primeiro");
      }

      await roundParticipantRepository.update(roundId, playerSessionId, {
        status: PLAYER_STATUS.SUBMITTED,
        submittedAt: stoppedAt,
      });

      const updated = await getRoundOrFail(roundId);
      await roundService.finalizeRound(updated, {
        reason: "STOP",
        firstStopperId: playerSessionId,
        alreadyStopped: true,
      });
      return updated;
    });
  },

  /** STOP forcado pelo professor. */
  async forceStop(roundId) {
    return gameLock.run(lockKey(roundId), async () => {
      const round = await getRoundOrFail(roundId);
      if (round.status !== ROUND_STATUS.PLAYING) {
        throw conflict("A rodada não está em andamento");
      }
      const claimed = await roundRepository.transitionIfStatus(roundId, ROUND_STATUS.PLAYING, {
        status: ROUND_STATUS.STOPPED,
        stoppedAt: new Date(),
        stopReason: "TEACHER",
      });
      if (claimed.count === 0) throw conflict("A rodada já foi encerrada");
      const updated = await getRoundOrFail(roundId);
      await roundService.finalizeRound(updated, { reason: "TEACHER", alreadyStopped: true });
      return updated;
    });
  },

  /** Encerramento automatico por tempo (spec 14). */
  async handleTimeout(roundId) {
    return gameLock.run(lockKey(roundId), async () => {
      const round = await roundRepository.findById(roundId);
      if (!round || round.status !== ROUND_STATUS.PLAYING) return null;
      const claimed = await roundRepository.transitionIfStatus(roundId, ROUND_STATUS.PLAYING, {
        status: ROUND_STATUS.STOPPED,
        stoppedAt: new Date(),
        stopReason: "TIMEOUT",
      });
      if (claimed.count === 0) return null;
      const updated = await getRoundOrFail(roundId);
      await roundService.finalizeRound(updated, { reason: "TIMEOUT", alreadyStopped: true });
      return updated;
    });
  },

  /**
   * Passos comuns pos-STOP: bloqueia respostas, avisa os clientes e abre
   * imediatamente a fase de correcao (spec 12, item 10).
   */
  async finalizeRound(round, { reason, firstStopperId = null, alreadyStopped = false } = {}) {
    clearRoundTimer(round.id);

    if (!alreadyStopped) {
      await roundRepository.transitionIfStatus(round.id, ROUND_STATUS.PLAYING, {
        status: ROUND_STATUS.STOPPED,
        stoppedAt: new Date(),
        stopReason: reason,
      });
    }

    await roundParticipantRepository.updateManyStatus(round.id, [PLAYER_STATUS.PLAYING], {
      status: PLAYER_STATUS.FINISHED,
    });
    const room = await resolveRoom(round.gameId);
    await prisma.playerSession.updateMany({
      where: { roomId: room.id, status: { in: [PLAYER_STATUS.PLAYING, PLAYER_STATUS.SUBMITTED] } },
      data: { status: PLAYER_STATUS.FINISHED },
    });

    const stopper = firstStopperId ?? round.firstStopperId ?? null;
    let stopperName = null;
    if (stopper) {
      const session = await prisma.playerSession.findUnique({
        where: { id: stopper },
        include: { student: { select: { name: true } } },
      });
      stopperName = session?.student?.name ?? null;
    }

    const event = reason === "TIMEOUT" ? "roundTimedOut" : "roundStopped";
    realtime.toRoom(room.code, event, {
      roundId: round.id,
      reason,
      firstStopperId: stopper,
      firstStopperName: stopperName,
      stoppedAt: new Date().toISOString(),
    });

    await telemetryRepository.record({
      type: `ROUND_${reason}`,
      roomId: room.id,
      roundId: round.id,
      playerSessionId: stopper,
      payload: { reason },
    });

    await roundService.openCorrection(round.id, { skipLock: true });
    await broadcastState(room.code);
    return room;
  },

  /**
   * Materializa a grade de correcao: garante uma linha por aluno elegivel
   * e categoria, com sugestao automatica de estado (spec 18/19/21).
   */
  async openCorrection(roundId, { skipLock = false } = {}) {
    const run = async () => {
      const round = await getRoundOrFail(roundId);
      if (round.status === ROUND_STATUS.CORRECTION) return round;
      if (round.status !== ROUND_STATUS.STOPPED) {
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
          const suggested = suggestReviewState(answer.value, round.letter);
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
      await roundRepository.transitionIfStatus(roundId, ROUND_STATUS.STOPPED, {
        status: ROUND_STATUS.CORRECTION,
      });

      const updated = await getRoundOrFail(roundId);
      const room = await resolveRoom(round.gameId);
      realtime.toRoom(room.code, "correctionStarted", { roundId, status: updated.status });
      return updated;
    };

    return skipLock ? run() : gameLock.run(lockKey(roundId), run);
  },

  /** Aplica a pontuacao 10/5/0 e atualiza o ranking (spec 19 e 42). */
  async score(roundId) {
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
      const scored = scoreAnswers(scoreable);

      const answerUpdates = answers.map((answer) => {
        const entry = scored.get(answer.id);
        const score = entry?.score ?? 0;
        return prisma.answer.update({
          where: { id: answer.id },
          data: { score, isValid: score > 0 },
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

      assertTransition(round.status, ROUND_STATUS.SCORED);
      await prisma.$transaction([
        ...answerUpdates,
        ...participantUpdates,
        ...scoreUpdates,
        prisma.round.updateMany({
          where: { id: roundId, status: ROUND_STATUS.CORRECTION },
          data: { status: ROUND_STATUS.SCORED, scoredAt: new Date() },
        }),
      ]);

      const room = await resolveRoom(round.gameId);
      const ranking = await viewService.loadRanking(round.gameId);
      realtime.toRoom(room.code, "scoreUpdated", {
        roundId,
        results: participants.map((participant) => ({
          playerSessionId: participant.playerSessionId,
          name: participant.playerSession.student.name,
          roundScore: totals.get(participant.playerSessionId) ?? 0,
          eliminated: eliminated.has(participant.playerSessionId),
        })),
      });
      realtime.toRoom(room.code, "rankingUpdated", { ranking });
      await broadcastState(room.code);
      return { round: await getRoundOrFail(roundId), ranking };
    });
  },

  /** Encerra a rodada definitivamente. */
  async finish(roundId) {
    return gameLock.run(lockKey(roundId), async () => {
      const round = await getRoundOrFail(roundId);
      if (round.status === ROUND_STATUS.FINISHED) return round;
      assertTransition(round.status, ROUND_STATUS.FINISHED);
      clearRoundTimer(roundId);
      await roundRepository.update(roundId, { status: ROUND_STATUS.FINISHED });
      const updated = await getRoundOrFail(roundId);
      const room = await resolveRoom(round.gameId);
      realtime.toRoom(room.code, "roundFinished", { roundId, status: updated.status });
      await broadcastState(room.code);
      return updated;
    });
  },

  /**
   * Cancela a rodada atual em qualquer estado, sem pontuar.
   *
   * O professor usa isso para descartar uma rodada iniciada por engano e
   * comecar outra. As respostas continuam no banco para auditoria (spec 44),
   * mas nao geram pontos: a rodada vai direto para FINISHED.
   */
  async cancel(roundId) {
    return gameLock.run(lockKey(roundId), async () => {
      const round = await getRoundOrFail(roundId);
      if (round.status === ROUND_STATUS.FINISHED) return round;

      clearRoundTimer(roundId);
      assertTransition(round.status, ROUND_STATUS.FINISHED);
      await roundRepository.update(roundId, {
        status: ROUND_STATUS.FINISHED,
        stopReason: "CANCELLED",
        stoppedAt: round.stoppedAt ?? new Date(),
      });

      // Todos voltam a poder jogar a proxima rodada, inclusive eliminados.
      const room = await resolveRoom(round.gameId);
      await roundParticipantRepository.updateManyStatus(
        roundId,
        [PLAYER_STATUS.PLAYING, PLAYER_STATUS.SUBMITTED, PLAYER_STATUS.ELIMINATED],
        { status: PLAYER_STATUS.FINISHED },
      );
      await prisma.playerSession.updateMany({
        where: { roomId: room.id },
        data: { status: PLAYER_STATUS.READY },
      });

      const updated = await getRoundOrFail(roundId);
      realtime.toRoom(room.code, "roundCancelled", {
        roundId,
        roundNumber: updated.roundNumber,
        message: "O professor cancelou esta rodada.",
      });
      await telemetryRepository.record({
        type: "ROUND_CANCELLED",
        roomId: room.id,
        roundId,
        payload: { previousStatus: round.status },
      });
      await broadcastState(room.code);
      return updated;
    });
  },

  /** Fluxo "PROXIMA RODADA" do painel do professor (spec 27). */
  async next({ gameId, categorySetId, durationSeconds, themeName }) {
    const current = await roundRepository.findCurrentByGame(gameId);
    if (current && current.status !== ROUND_STATUS.FINISHED) {
      if (current.status === ROUND_STATUS.CORRECTION) {
        throw conflict("Finalize a correção e pontue a rodada atual antes de avançar");
      }
      if (![ROUND_STATUS.SCORED, ROUND_STATUS.CREATED, ROUND_STATUS.READY].includes(current.status)) {
        throw conflict(
          `A rodada atual está em ${current.status}. Encerre-a ou cancele antes de avançar.`,
        );
      }
      await roundService.finish(current.id);
    }
    const round = await roundService.create({ gameId, categorySetId, durationSeconds, themeName });
    const room = await resolveRoom(gameId);
    realtime.toRoom(room.code, "nextRound", { roundId: round.id, roundNumber: round.roundNumber });
    return round;
  },

  /**
   * Eliminacao por saida do fullscreen (spec 24 e 26).
   * Definitiva para a rodada corrente; o aluno volta na proxima.
   */
  async eliminate({ roundId, playerSessionId, reason = "FULLSCREEN_EXIT" }) {
    return gameLock.run(lockKey(roundId), async () => {
      const round = await roundRepository.findById(roundId);
      if (!round || round.status !== ROUND_STATUS.PLAYING) return null;

      const claimed = await roundParticipantRepository.updateIfStatus(
        roundId,
        playerSessionId,
        PLAYER_STATUS.PLAYING,
        { status: PLAYER_STATUS.ELIMINATED, eliminatedAt: new Date(), eliminationReason: reason },
      );
      if (claimed.count === 0) return null;

      await prisma.playerSession.update({
        where: { id: playerSessionId },
        data: { status: PLAYER_STATUS.ELIMINATED },
      });

      const room = await resolveRoom(round.gameId);
      realtime.toPlayer(playerSessionId, "playerEliminated", {
        roundId,
        reason,
        message:
          "Você saiu da tela cheia.\n\nVocê foi eliminado desta rodada.\n\nVocê poderá participar da próxima rodada.",
      });
      realtime.toTeachers(room.code, "playerEliminated", { roundId, playerSessionId, reason });
      await telemetryRepository.record({
        type: "PLAYER_ELIMINATED",
        roomId: room.id,
        roundId,
        playerSessionId,
        payload: { reason },
      });
      await broadcastState(room.code);
      return { roundId, playerSessionId, reason };
    });
  },

  /** Categorias obrigatorias ainda sem resposta preenchida (spec 11). */
  async missingRequiredCategories(round, playerSessionId) {
    const required = round.categories.filter((category) => category.required);
    if (required.length === 0) return [];
    const answers = await answerRepository.listByPlayer(round.id, playerSessionId);
    const filled = new Set(
      answers.filter((answer) => isFilled(answer.value)).map((answer) => answer.roundCategoryId),
    );
    return required.filter((category) => !filled.has(category.id));
  },

  /** Grade de correcao para o painel do professor (spec 18). */
  async correctionGrid(roundId) {
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
            startsWithLetter:
              answer.normalizedValue.length > 0 &&
              answer.normalizedValue.startsWith(normalizeAnswer(round.letter)),
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
  },

  get: getRoundOrFail,
};

export default roundService;
