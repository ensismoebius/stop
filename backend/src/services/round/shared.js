import { badRequest, notFound } from "../../lib/errors.js";
import logger from "../../lib/logger.js";
import roundRepository from "../../repositories/roundRepository.js";
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
    const [teacher, publicView] = await Promise.all([
      viewService.teacherState(roomCode),
      viewService.publicState(roomCode),
    ]);
    realtime.toTeachers(roomCode, "roomState", teacher);
    realtime.toScreens(roomCode, "roomState", publicView);

    // Cada aluno recebe apenas o proprio estado (spec 49): mesma rodada,
    // nunca as respostas de outro colega. Carregado em lote (uma consulta
    // por tabela para a sala inteira) em vez de uma rodada de queries por
    // aluno conectado.
    try {
      const playerStates = await viewService.playerStatesForRoom(roomCode);
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
