import * as realtime from "../../sockets/realtime.js";
import env from "../../config/env.js";

/**
 * Fila de saída de `roomState` (spec 4: entrega escalável).
 *
 * Cada difusão autoritativa produz UMA versão de estado por perfil
 * (professor, tela pública, aluno). Para cada destino guardamos apenas o
 * estado MAIS RECENTE pendente — se duas difusões (ex.: rajada de join
 * seguida de uma transição) chegarem antes do flush, a antiga é descartada
 * (`latest wins`). O cliente nunca fica com N estados na fila nem o
 * servidor gasta trabalho emitindo versões intermediárias; a convergeência
 * total fica por conta do versionamento + `requestState` + heartbeat.
 *
 * Em teste (`env.isTest`) entrega de forma síncrona — nenhum estado fica
 * pendente após o tear-down e o comportamento observado pelos testes que
 * esperam `roomState` não muda.
 */
const EVENT = "roomState";

const pendingByRoom = new Map();

/** Separa o snapshot nas entregas por perfil (professor, tela e cada aluno). */
function collectDeliveries(snapshot) {
  const deliveries = [
    { key: "teacher", target: { type: "teachers" }, payload: snapshot.state.teacher },
    { key: "screen", target: { type: "screens" }, payload: snapshot.state.publicView },
  ];
  snapshot.state.playerStates.forEach((payload, playerSessionId) => {
    deliveries.push({
      key: `player:${playerSessionId}`,
      target: { type: "player", id: playerSessionId },
      payload,
    });
  });
  return deliveries;
}

/** Entrega um único payload ao destino certo da sala. */
function deliver(roomCode, { target, payload }) {
  if (target.type === "teachers") realtime.toTeachers(roomCode, EVENT, payload);
  else if (target.type === "screens") realtime.toScreens(roomCode, EVENT, payload);
  else realtime.toPlayer(target.id, EVENT, payload);
}

/** Descarrega de uma vez todos os pendentes de uma sala (latest-wins). */
function flushRoom(roomCode) {
  const byKey = pendingByRoom.get(roomCode);
  if (!byKey) return;
  pendingByRoom.delete(roomCode);
  for (const { target, payload } of byKey.values()) deliver(roomCode, { target, payload });
}

/** Agenda o flush da sala para o próximo tick do event loop. */
function scheduleFlush(roomCode) {
  setImmediate(() => flushRoom(roomCode));
}

/**
 * Enfileira a difusão de um snapshot autoritativo. No máximo um payload por
 * destino fica pendente por vez; o último vence.
 */
export function enqueueRoomState(roomCode, snapshot) {
  if (!realtime.getIo()) return;
  const deliveries = collectDeliveries(snapshot);
  if (env.isTest) {
    for (const delivery of deliveries) deliver(roomCode, delivery);
    return;
  }
  let byKey = pendingByRoom.get(roomCode);
  if (!byKey) {
    byKey = new Map();
    pendingByRoom.set(roomCode, byKey);
  }
  for (const delivery of deliveries) byKey.set(delivery.key, delivery);
  scheduleFlush(roomCode);
}

/** Limpa difusões pendentes (uso em restart/tear-down). */
export function dropRoom(roomCode) {
  pendingByRoom.delete(roomCode);
}

export default { enqueueRoomState, dropRoom };