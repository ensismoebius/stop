import { badRequest, notFound } from "../../lib/errors.js";
import env from "../../config/env.js";
import logger from "../../lib/logger.js";
import roundRepository from "../../repositories/roundRepository.js";
import roomRepository from "../../repositories/roomRepository.js";
import * as realtime from "../../sockets/realtime.js";
import roomState from "../room/roomState.js";

export const lockKey = (roundId) => `round:${roundId}`;

/** A sala aberta da partida (ou a primeira encontrada); erro quando nao ha sala. */
export async function resolveRoom(gameId) {
  const rooms = await roomRepository.listByGame(gameId);
  const open = rooms.find((room) => room.status === "OPEN") ?? rooms[0];
  if (!open) throw badRequest("A partida ainda não possui sala");
  return open;
}

/** A rodada pelo id; lance 404 quando nao existe. */
export async function getRoundOrFail(roundId) {
  const round = await roundRepository.findById(roundId);
  if (!round) throw notFound("Rodada não encontrada");
  return round;
}

/**
 * Envia o estado autoritativo atualizado para painel do professor, tela
 * publica e cada aluno da sala — ponto único de commit (baseline: versão +
 * snapshot + outbound queue).
 *
 * Sem isso, o cliente do aluno so recebe o estado da rodada (incluindo o
 * `endsAt` do cronometro) no momento em que entra na sala: eventos como
 * "a rodada comecou" chegam nomeados, mas nada atualiza o estado
 * compartilhado do React caso o handler nao trate o payload explicitamente.
 * Reenviar aqui garante que todos os clientes fiquem consistentes com o
 * servidor sempre que algo relevante mudar (spec 33 e 45).
 */
export async function broadcastState(roomCode) {
  return roomState.publish(roomCode);
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
      // Ponto que não deveria falhar: difusão coalescida do estado após
      // join/ready/disconnect. `publish` já trata erros internos e avisa,
      // mas esta proteção extra garante que nenhuma rejeição estoure como
      // unhandled no timer — com contexto para copiar no diagnóstico.
      broadcastState(roomCode).catch((error) => {
        logger.warn(`Falha na difusao coalescida da sala ${roomCode}`, {
          room: roomCode,
          error: { name: error?.name ?? "Error", message: error?.message ?? String(error), code: error?.code ?? null },
        });
      });
    }, COALESCE_WINDOW_MS),
  );
}
