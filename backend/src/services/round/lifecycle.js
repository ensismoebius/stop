import prisma from "../../lib/prisma.js";
import env from "../../config/env.js";
import gameLock from "../../lib/asyncLock.js";
import { badRequest, conflict } from "../../lib/errors.js";
import roundRepository, { roundParticipantRepository } from "../../repositories/roundRepository.js";
import gameRepository from "../../repositories/gameRepository.js";
import telemetryRepository from "../../repositories/telemetryRepository.js";
import { categorySetRepository } from "../../repositories/categoryRepository.js";
import { drawLetter } from "../../game/letters.js";
import { assertTransition, ROUND_STATUS } from "../../game/roundState.js";
import { PLAYER_STATUS } from "../../game/playerState.js";
import logger from "../../lib/logger.js";
import { clearRoundTimer, clearTimer, scheduleRoundEnd, scheduleTimer } from "../../game/timers.js";
import * as realtime from "../../sockets/realtime.js";
import viewService from "../viewService.js";
import { lockKey, resolveRoom, getRoundOrFail, broadcastState, broadcastStateSoon } from "./shared.js";
import { handleTimeout } from "./stop.js";

const revealTimerKey = (roundId) => `round:${roundId}:reveal`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
// Re-difusao de confirmacao apos a transicao para PLAYING (fixme.md #4).
// Colapsa para 0 em teste para a re-difusao nao sobreviver ao tear-down.
const CONFIRM_BROADCAST_DELAY_MS = env.isTest ? 0 : 1500;

/**
 * Cria a rodada e copia as categorias do conjunto escolhido.
 * A copia impede que alteracoes futuras no cadastro alterem uma partida
 * ja realizada (spec 17).
 */
export async function create({ gameId, categorySetId, durationSeconds, themeName, letterRule }) {
  const game = await gameRepository.findById(gameId);
  if (game?.status === "FINISHED") {
    throw conflict("Esta partida já foi finalizada e não pode receber novas rodadas.");
  }

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
  const room = await resolveRoom(gameId);

  // Round + categorias + reset dos jogadores + status do jogo formam um
  // unico passo logico: uma falha no meio deixaria uma rodada sem
  // categorias (que passaria a aceitar STOP imediato, spec 11) ou o jogo
  // "ACTIVE" com nenhuma rodada de fato criada.
  const round = await prisma.$transaction(async (tx) => {
    const created = await tx.round.create({
      data: {
        gameId,
        roundNumber,
        categorySetId,
        themeName: themeName ?? set.name,
        letter: "",
        letterRule: letterRule ?? "STARTS_WITH",
        durationSeconds: durationSeconds ?? env.defaultRoundDuration,
        status: ROUND_STATUS.CREATED,
      },
    });

    await tx.roundCategory.createMany({
      data: categories.map((category, index) => ({
        roundId: created.id,
        categoryId: category.categoryId ?? category.id ?? null,
        name: category.name,
        description: category.description ?? null,
        required: category.required ?? true,
        order: category.order ?? index,
      })),
    });

    // Novo round: eliminacoes anteriores nao valem mais (spec 27).
    await tx.playerSession.updateMany({
      where: { roomId: room.id, status: { in: ["PLAYING", "SUBMITTED", "ELIMINATED", "FINISHED"] } },
      data: { status: PLAYER_STATUS.READY },
    });

    await tx.game.updateMany({
      where: { id: gameId, status: "CREATED" },
      data: { status: "ACTIVE", startedAt: new Date() },
    });

    return created;
  });

  const created = await getRoundOrFail(round.id);
  realtime.toRoom(room.code, "roundCreated", {
    round: { ...viewService.roundSummary(created), letter: null },
  });
  await broadcastState(room.code);
  return created;
}

/** Sorteio da letra: sempre no servidor (spec 15/16). */
export async function drawRoundLetter(roundId) {
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
}

/**
 * Inicia a rodada (spec 14/33). Nao liga o cronometro nem revela a letra
 * de imediato: primeiro transiciona para STARTING e devolve — a letra
 * fica oculta e o cronometro so comeca depois da sequencia de revelacao
 * (animacao publica + contagem regressiva sincronizada, enhancements.md
 * secoes 4-7 e 54), que roda em segundo plano em `runRevealSequence` para
 * nao travar a resposta desta chamada nem o mutex da rodada por segundos.
 */
export async function start(roundId) {
  const started = await gameLock.run(lockKey(roundId), async () => {
    const round = await getRoundOrFail(roundId);
    if (!round.letter) throw badRequest("Sorteie a letra antes de iniciar a rodada");
    assertTransition(round.status, ROUND_STATUS.STARTING);

    const room = await resolveRoom(round.gameId);
    const sessions = await prisma.playerSession.findMany({
      where: { roomId: room.id },
      select: { id: true },
    });
    if (sessions.length === 0) throw badRequest("Nenhum aluno conectado à sala");

    const claimed = await roundRepository.transitionIfStatus(roundId, ROUND_STATUS.READY, {
      status: ROUND_STATUS.STARTING,
    });
    if (claimed.count === 0) throw conflict("A rodada já foi iniciada");

    const updated = await getRoundOrFail(roundId);
    realtime.toRoom(room.code, "roundStarting", {
      round: viewService.roundSummary(updated),
      serverTime: new Date().toISOString(),
    });
    await broadcastState(room.code);
    return updated;
  });

  runRevealSequence(roundId).catch((error) =>
    logger.error(`Falha na sequência de revelação da rodada ${roundId}`, error),
  );

  return started;
}

/**
 * Espera a animacao publica e a contagem regressiva sincronizada, depois
 * agenda a transicao para PLAYING no instante combinado. Reconfere o
 * status a cada etapa: um cancelamento durante a sequencia deve fazer
 * essa cadeia desistir silenciosamente, nunca sobrescrever um estado mais
 * avancado.
 */
async function runRevealSequence(roundId) {
  await delay(env.letterRevealAnimationMs);

  const afterAnimation = await roundRepository.findById(roundId);
  if (!afterAnimation || afterAnimation.status !== ROUND_STATUS.STARTING) return;

  const room = await resolveRoom(afterAnimation.gameId);

  // Contagem regressiva sincronizada (spec 54): pede ack de cada
  // dispositivo aluno conectado, com timeout — nunca trava a partida por
  // causa de um device offline ou lento (mesmo principio da spec 39).
  await realtime.requestAck(
    realtime.rooms.players(room.code),
    "syncCountdownRequested",
    { roundId, countdownMs: env.countdownDurationMs },
    env.countdownAckTimeoutMs,
  );

  const afterAck = await roundRepository.findById(roundId);
  if (!afterAck || afterAck.status !== ROUND_STATUS.STARTING) return;

  const revealAt = new Date(Date.now() + env.countdownDurationMs);
  await roundRepository.update(roundId, { revealAt });

  const updated = await getRoundOrFail(roundId);
  realtime.toRoom(room.code, "syncCountdownReleased", {
    roundId,
    revealAt: revealAt.toISOString(),
    serverTime: new Date().toISOString(),
  });
  await broadcastState(room.code);

  scheduleTimer(revealTimerKey(roundId), revealAt.getTime() - Date.now(), () =>
    beginPlaying(roundId).catch((error) =>
      logger.error(`Falha ao iniciar PLAYING da rodada ${roundId}`, error),
    ),
  );
}

/**
 * Segunda metade do antigo `start`: liga o cronometro e libera respostas.
 * Exportada tambem para `game/recovery.js`: uma rodada presa em STARTING
 * quando o servidor reinicia nao tem como retomar com seguranca a
 * animacao/contagem depois de um tempo de parada desconhecido — a
 * recuperacao chama isto diretamente para avancar para PLAYING.
 */
export async function beginPlaying(roundId) {
  return gameLock.run(lockKey(roundId), async () => {
    clearTimer(revealTimerKey(roundId));
    const round = await getRoundOrFail(roundId);
    if (round.status !== ROUND_STATUS.STARTING) return round;

    const room = await resolveRoom(round.gameId);
    const sessions = await prisma.playerSession.findMany({
      where: { roomId: room.id },
      select: { id: true },
    });

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + round.durationSeconds * 1000);

    // Participantes/sessoes primeiro, status PLAYING por ultimo: quem
    // observa `round.status === "PLAYING"` (ex.: `waitForRoundStatus` nos
    // testes, ou qualquer cliente que reconecta nesse instante) precisa
    // encontrar tudo ja consistente, nao uma rodada "PLAYING" sem
    // participantes ainda. A trava da rodada impede que `cancel`/`finish`
    // rodem no meio dessas escritas (mesma chave de lock).
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

    const claimed = await roundRepository.transitionIfStatus(roundId, ROUND_STATUS.STARTING, {
      status: ROUND_STATUS.PLAYING,
      startedAt,
      endsAt,
    });
    if (claimed.count === 0) return getRoundOrFail(roundId);

    scheduleRoundEnd(roundId, endsAt.getTime() - Date.now(), () => handleTimeout(roundId));

    const updated = await getRoundOrFail(roundId);
    realtime.toRoom(room.code, "roundStarted", {
      round: viewService.roundSummary(updated),
      serverTime: new Date().toISOString(),
    });
    await broadcastState(room.code);
    // Reforco da transicao (fixme.md #4): PLAYING e o estado que libera as
    // categorias no aluno. Um unico push fire-and-forget pode se perder no
    // instante exato da mudanca (meia-conexao de Wi-Fi de sala) — o sintoma
    // real da turma presa na tela de espera. Uma re-difusao coalescida
    // pouco depois pega quem recebeu o `roundStarted` nomeado mas perdeu o
    // `roomState` PLAYING. O cliente tambem se auto-recupera
    // (fixme.md #1), entao isto e so a primeira linha de defesa.
    setTimeout(() => broadcastStateSoon(room.code), CONFIRM_BROADCAST_DELAY_MS);
    await telemetryRepository.record({
      type: "ROUND_STARTED",
      roomId: room.id,
      roundId,
      payload: { players: sessions.length },
    });
    return updated;
  });
}

/** Encerra a rodada definitivamente. */
export async function finish(roundId) {
  return gameLock.run(lockKey(roundId), async () => {
    const round = await getRoundOrFail(roundId);
    if (round.status === ROUND_STATUS.FINISHED) return round;
    assertTransition(round.status, ROUND_STATUS.FINISHED);
    clearRoundTimer(roundId);
    clearTimer(revealTimerKey(roundId));
    await roundRepository.update(roundId, { status: ROUND_STATUS.FINISHED });
    const updated = await getRoundOrFail(roundId);
    const room = await resolveRoom(round.gameId);
    realtime.toRoom(room.code, "roundFinished", { roundId, status: updated.status });
    await broadcastState(room.code);
    return updated;
  });
}

/**
 * Cancela a rodada atual em qualquer estado, sem pontuar.
 *
 * O professor usa isso para descartar uma rodada iniciada por engano e
 * comecar outra. As respostas continuam no banco para auditoria (spec 44),
 * mas nao geram pontos: a rodada vai direto para FINISHED.
 */
export async function cancel(roundId, { message } = {}) {
  return gameLock.run(lockKey(roundId), async () => {
    const round = await getRoundOrFail(roundId);
    if (round.status === ROUND_STATUS.FINISHED) return round;

    clearRoundTimer(roundId);
    clearTimer(revealTimerKey(roundId));
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
      // Fechar a rodada e o mesmo mecanismo em dois casos bem diferentes:
      // o professor cancelar a rodada, e o professor finalizar a partida.
      // Sem poder trocar o texto, o aluno via "o professor cancelou esta
      // rodada" no fim da partida — informacao simplesmente errada.
      message: message ?? "O professor cancelou esta rodada.",
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
}

/** Fluxo "PROXIMA RODADA" do painel do professor (spec 27). */
export async function next({ gameId, categorySetId, durationSeconds, themeName }) {
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
    await finish(current.id);
  }
  const round = await create({ gameId, categorySetId, durationSeconds, themeName });
  const room = await resolveRoom(gameId);
  realtime.toRoom(room.code, "nextRound", { roundId: round.id, roundNumber: round.roundNumber });
  return round;
}
