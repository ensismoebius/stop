import prisma from "../../lib/prisma.js";
import gameLock from "../../lib/asyncLock.js";
import { badRequest, conflict, forbidden } from "../../lib/errors.js";
import roundRepository, { roundParticipantRepository } from "../../repositories/roundRepository.js";
import telemetryRepository from "../../repositories/telemetryRepository.js";
import { ROUND_STATUS } from "../../game/roundState.js";
import { PLAYER_STATUS } from "../../game/playerState.js";
import { clearRoundTimer } from "../../game/timers.js";
import * as realtime from "../../sockets/realtime.js";
import { lockKey, resolveRoom, getRoundOrFail, broadcastState } from "./shared.js";
import { missingRequiredCategories } from "./correction.js";
import { startCollaborativeCorrection } from "./collaborativeCorrection.js";

/**
 * Passos comuns pos-STOP: bloqueia respostas, avisa os clientes e abre
 * imediatamente a fase de correcao (spec 12, item 10).
 */
export async function finalizeRound(round, { reason, firstStopperId = null, alreadyStopped = false } = {}) {
  clearRoundTimer(round.id);

  if (!alreadyStopped) {
    await roundRepository.transitionIfStatus(round.id, ROUND_STATUS.PLAYING, {
      status: ROUND_STATUS.STOPPED,
      stoppedAt: new Date(),
      stopReason: reason,
    });
  }

  // Inclui SUBMITTED: quem deu STOP ja foi marcado assim antes de chegar
  // aqui e tambem precisa alcancar o status terminal FINISHED.
  await roundParticipantRepository.updateManyStatus(
    round.id,
    [PLAYER_STATUS.PLAYING, PLAYER_STATUS.SUBMITTED],
    { status: PLAYER_STATUS.FINISHED },
  );
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

  await startCollaborativeCorrection(round, { skipLock: true });
  await broadcastState(room.code);
  return room;
}

/**
 * STOP solicitado por um aluno (spec 11, 12 e 13).
 * Toda a validacao ocorre no servidor; a corrida e resolvida por um
 * UPDATE condicional atomico.
 */
export async function requestStop({ roundId, playerSessionId }) {
  return gameLock.run(lockKey(roundId), async () => {
    const round = await getRoundOrFail(roundId);

    if (round.status !== ROUND_STATUS.PLAYING) {
      throw conflict("A rodada não está em andamento");
    }
    if (round.endsAt && round.endsAt.getTime() <= Date.now()) {
      // O tempo acabou antes deste STOP: encerra por timeout (spec 14).
      await finalizeRound(round, { reason: "TIMEOUT" });
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

    const missing = await missingRequiredCategories(round, playerSessionId);
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
    await finalizeRound(updated, {
      reason: "STOP",
      firstStopperId: playerSessionId,
      alreadyStopped: true,
    });
    return updated;
  });
}

/** STOP forcado pelo professor. */
export async function forceStop(roundId) {
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
    await finalizeRound(updated, { reason: "TEACHER", alreadyStopped: true });
    return updated;
  });
}

/** Encerramento automatico por tempo (spec 14). */
export async function handleTimeout(roundId) {
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
    await finalizeRound(updated, { reason: "TIMEOUT", alreadyStopped: true });
    return updated;
  });
}

/**
 * Eliminacao por saida do fullscreen (spec 24 e 26).
 * Definitiva para a rodada corrente; o aluno volta na proxima.
 */
export async function eliminate({ roundId, playerSessionId, reason = "FULLSCREEN_EXIT" }) {
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
}
