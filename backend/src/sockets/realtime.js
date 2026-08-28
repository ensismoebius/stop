import logger from "../lib/logger.js";

/**
 * Ponte entre as regras de negocio e o Socket.IO.
 *
 * Os servicos nao conhecem o objeto `io`: apenas publicam eventos por
 * destino. Isso mantem as regras testaveis sem servidor de sockets.
 */
let socketIo = null;

export const rooms = {
  all: (code) => `room:${code}`,
  players: (code) => `room:${code}:players`,
  teachers: (code) => `room:${code}:teachers`,
  screens: (code) => `room:${code}:screen`,
  player: (playerSessionId) => `player:${playerSessionId}`,
};

/** Injeta a instancia do Socket.IO (chamado na criacao do servidor). */
export function setIo(instance) {
  socketIo = instance;
}

/** Devolve a instancia injetada do Socket.IO (ou `null` antes da criacao). */
export function getIo() {
  return socketIo;
}

/** Difunde um evento para o alvo (sala, perfil ou aluno) quando há Socket.IO. */
function emit(target, event, payload) {
  if (!socketIo) {
    logger.debug(`Socket.IO indisponivel; evento ${event} descartado`);
    return;
  }
  socketIo.to(target).emit(event, payload);
}

/** Todos os clientes conectados a sala (alunos, professor e tela publica). */
export const toRoom = (code, event, payload) => emit(rooms.all(code), event, payload);

/** Somente os alunos. */
export const toPlayers = (code, event, payload) => emit(rooms.players(code), event, payload);

/** Somente o painel do professor. */
export const toTeachers = (code, event, payload) => emit(rooms.teachers(code), event, payload);

/** Somente a tela publica (TV/projetor). */
export const toScreens = (code, event, payload) => emit(rooms.screens(code), event, payload);

/** Um aluno especifico, em todas as abas/dispositivos daquela sessao. */
export const toPlayer = (playerSessionId, event, payload) =>
  emit(rooms.player(playerSessionId), event, payload);

/**
 * Emite para uma sala e aguarda o reconhecimento (ack) de cada socket
 * conectado naquele momento, com timeout — nunca trava indefinidamente por
 * causa de um dispositivo lento ou offline (enhancements.md secao 54).
 *
 * Resolve sempre (nunca rejeita): um timeout e tratado como "alguns
 * dispositivos nao confirmaram a tempo", nao como falha da operacao.
 */
export function requestAck(target, event, payload, timeoutMs) {
  return new Promise((resolve) => {
    if (!socketIo) {
      resolve({ acked: 0, total: 0, timedOut: false });
      return;
    }
    socketIo.in(target)
      .timeout(timeoutMs)
      .emit(event, payload, (err, responses) => {
        const total = Array.isArray(responses) ? responses.length : 0;
        const acked = Array.isArray(responses) ? responses.filter(Boolean).length : 0;
        resolve({ acked, total, timedOut: Boolean(err) });
      });
  });
}

export default {
  setIo,
  getIo,
  toRoom,
  toPlayers,
  toTeachers,
  toScreens,
  toPlayer,
  requestAck,
  rooms,
};
