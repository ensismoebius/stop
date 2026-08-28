import logger from "../../lib/logger.js";
import { syncStats } from "../../sockets/syncRegistry.js";
import viewService from "../viewService.js";
import roomRepository from "../../repositories/roomRepository.js";
import { roundParticipantRepository } from "../../repositories/roundRepository.js";
import { enqueueRoomState } from "../realtime/outboundQueue.js";

/**
 * Ponto único de "commit" do estado autoritativo de uma sala (baseline).
 *
 * Toda mudança relevante de sala/rodada termina em `publish`: carrega o
 * contexto UMA vez, incrementa `stateVersion` no banco (atômico), monta as
 * três projeções (professor/tela/aluno) com a posição `(roomEpoch,
 * stateVersion)` anexada e enfileira a difusão no outbound queue
 * (coalescente, latest-wins). Nenhum caminho difunde estado por fora daqui.
 *
 * A versão é persistida no banco (não só em memória): um restart do
 * servidor reidrata o cache a partir do `Room` e os clientes que já
 * adotaram (epoch, vN) nunca são rebaixados.
 */
const snapshotsByRoom = new Map();

/** Contexto comum das três projeções de uma difusão — 2 queries + participantes. */
async function loadContext(roomCode) {
  const { room, round } = await viewService.loadRoomContext(roomCode);
  const participants = round ? await roundParticipantRepository.listByRound(round.id) : [];
  return { room, round, participants };
}

/** Empacota o contexto carregado + ranking + versão como base das projeções. */
function baseCtx(ctx, ranking, version) {
  return {
    room: ctx.room,
    round: ctx.round,
    participants: ctx.participants,
    ranking,
    version,
  };
}

/**
 * Constrói o snapshot autoritativo. Com `bump: true` incrementa
 * `stateVersion` (commit de verdade); com `bump: false` apenas lê a versão
 * corrente (response path de `requestState`, que não deve avançar a
 * versão).
 */
async function build(roomCode, { bump }) {
  const ctx = await loadContext(roomCode);
  const ranking = await viewService.loadRanking(ctx.room.gameId);
  const version = bump
    ? await roomRepository.bumpStateVersion(ctx.room.id)
    : await roomRepository.getVersion(ctx.room.id);
  const [teacher, publicView, playerStates] = await Promise.all([
    viewService.teacherState(roomCode, baseCtx(ctx, ranking, version)),
    viewService.publicState(roomCode, baseCtx(ctx, ranking, version)),
    viewService.playerStatesForRoom(roomCode, baseCtx(ctx, ranking, version)),
  ]);
  teacher.syncStats = syncStats(roomCode, {
    totalConnected: ctx.room.sessions.filter((session) => Boolean(session.socketId)).length,
    currentEpoch: version.roomEpoch,
    currentVersion: version.stateVersion,
  });
  return {
    roomEpoch: version.roomEpoch,
    stateVersion: version.stateVersion,
    state: { teacher, publicView, playerStates },
    updatedAt: Date.now(),
  };
}

/** Retenta uma vez difusões interrompidas por falha transitória (ex.: P2034
 *  de concorrência no bump do MySQL): uma difusão perdida é a causa clássica
 *  de "o painel ficou preso numa fase antiga até recarregar". Como a versão
 *  é monotônica, o retry pode incrementar de novo sem comprometer clientes. */
const PUBLISH_RETRIES = 1;

/** Difunde o estado autoritativo corrente (increments versão). Nunca lança. */
export async function publish(roomCode) {
  for (let attempt = 0; attempt <= PUBLISH_RETRIES; attempt += 1) {
    try {
      const snapshot = await build(roomCode, { bump: true });
      snapshotsByRoom.set(roomCode, snapshot);
      enqueueRoomState(roomCode, snapshot);
      return snapshot;
    } catch (error) {
      const lastAttempt = attempt === PUBLISH_RETRIES;
      if (!lastAttempt) {
        logger.warn(`Falha transitória ao difundir estado da sala ${roomCode} — tentando de novo`, error?.message ?? error);
        continue;
      }
      logger.warn(`Falha ao difundir estado da sala ${roomCode}`, error?.message ?? error);
      return null;
    }
  }
  return null;
}

/** Estado autoritativo corrente SEM incrementar versão (requestState/heartbeat). */
export function getCurrent(roomCode) {
  return build(roomCode, { bump: false });
}

/** Snapshot em cache (a última versão publicada), se houver. */
export function getCached(roomCode) {
  return snapshotsByRoom.get(roomCode) ?? null;
}

/** Invalida o cache (chamado no encerramento/restart de sala). */
export function dropRoom(roomCode) {
  snapshotsByRoom.delete(roomCode);
}

/** Projeção do snapshot para o perfil de um cliente já conectado. */
export function roleStateFor(context, snapshot) {
  if (!snapshot) return null;
  if (context.role === "player") {
    return snapshot.state.playerStates.get(context.session.id) ?? null;
  }
  if (context.role === "teacher") return snapshot.state.teacher;
  return snapshot.state.publicView;
}

export default { publish, getCurrent, getCached, dropRoom, roleStateFor };