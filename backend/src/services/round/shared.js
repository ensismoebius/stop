import { badRequest, notFound } from "../../lib/errors.js";
import logger from "../../lib/logger.js";
import env from "../../config/env.js";
import roundRepository, { roundParticipantRepository } from "../../repositories/roundRepository.js";
import roomRepository from "../../repositories/roomRepository.js";
import * as realtime from "../../sockets/realtime.js";
import viewService from "../viewService.js";

export const lockKey = (roundId) => `round:${roundId}`;

export async function resolveRoom(gameId) {
  const rooms = await roomRepository.listByGame(gameId);
  const open = rooms.find((room) => room.status === "OPEN") ?? rooms[0];
  if (!open) throw badRequest("A partida ainda não possui sala");
  return open;
}

export async function getRoundOrFail(roundId) {
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
export async function broadcastState(roomCode) {
  try {
    const { room, round, participants } = await loadRoomBroadcastContext(roomCode);
    // Ranking e participantes carregados UMA vez e compartilhados pelas
    // tres projecoes. Antes da coalescence do fixme.md #2, cada uma das
    // tres montava o proprio contexto: eram ~6 consultas de ranking + 3
    // de contexto por difusao, multiplicadas pela rajada de join/ready.
    const ranking = await viewService.loadRanking(room.gameId);
    const [teacher, publicView] = await Promise.all([
      viewService.teacherState(roomCode, { room, round, participants, ranking }),
      viewService.publicState(roomCode, { room, round, participants, ranking }),
    ]);
    realtime.toTeachers(roomCode, "roomState", teacher);
    realtime.toScreens(roomCode, "roomState", publicView);

    // Cada aluno recebe apenas o proprio estado (spec 49): mesma rodada,
    // nunca as respostas de outro colega. Carregado em lote (uma consulta
    // por tabela para a sala inteira) em vez de uma rodada de queries por
    // aluno conectado.
    try {
      const playerStates = await viewService.playerStatesForRoom(roomCode, {
        room,
        round,
        participants,
        ranking,
      });
      for (const [playerSessionId, playerState] of playerStates) {
        realtime.toPlayer(playerSessionId, "roomState", playerState);
      }
    } catch (error) {
      logger.warn(`Falha ao atualizar estado dos alunos da sala ${roomCode}`, error?.message ?? error);
    }
  } catch (error) {
    logger.warn("Falha ao difundir estado da sala", error?.message ?? error);
  }
}

/**
 * Contexto comum das tres projecoes de uma difusao, consultado uma unica
 * vez. `room`/`round` vem de `loadRoomContext` (duas consultas); os
 * participantes da rodada corrente sao a terceira.
 */
async function loadRoomBroadcastContext(roomCode) {
  const { room, round } = await viewService.loadRoomContext(roomCode);
  const participants = round ? await roundParticipantRepository.listByRound(round.id) : [];
  return { room, round, participants };
}

// Janela de coalescencia para eventos de alta frequencia (join/ready/
// disconnect de dezenas de alunos em rajada). Em teste (sem carga real)
// colapsa para 0 para nao deixar difusoes pendentes apos o tear-down.
const COALESCE_WINDOW_MS = env.isTest ? 0 : 150;

const coalescedByRoom = new Map();

/**
 * `broadcastState` coalescido (fixme.md #2): agrupa varias solicitacoes da
 * mesma sala numa unica difusao alguns milissegundos depois. Nunca perde
 * correcao — a difusao rele o estado ja persistido do banco no momento em
 * que dispara. Transicoes criticas da rodada continuam usando
 * `broadcastState` imediato/aguardado; este serve exclusivamente para
 * diminuir a rajada de join/ready sem mudar o comportamento percebido.
 * Sem Socket.IO (testes de rules de negocio) nao ha nada a avisar.
 */
export function broadcastStateSoon(roomCode) {
  if (!realtime.getIo()) return;
  const pending = coalescedByRoom.get(roomCode);
  if (pending) clearTimeout(pending);
  coalescedByRoom.set(
    roomCode,
    setTimeout(() => {
      coalescedByRoom.delete(roomCode);
      broadcastState(roomCode);
    }, COALESCE_WINDOW_MS),
  );
}
