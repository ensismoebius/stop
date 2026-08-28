/**
 * Registro de sincronização por cliente (spec: monitor do professor).
 *
 * O servidor não consegue observar diretamente quando um `roomState`
 * fire-and-forget chegou ao device — mas o cliente confirma o que conhece
 * por `requestState` e `applicationHeartbeat` (ele reporta o
 * `(roomEpoch, stateVersion)` que adotou). Este registro guarda esse
 * última-posição-conhecida por sessão/professor/tela para o painel do
 * professor poder medir "Synchronized / Expected".
 *
 * Todo o mapa é Best-Effort: uma sala sem tráfego e sem clientes não tem
 * entradas, e isso é interpretado como "N/A", não como alerta.
 */

const byRoom = new Map(); // roomCode -> Map(key -> { roomEpoch, stateVersion })

/** Chave por tipo de cliente: player/screen usam a sessão; teacher é 1 por sala. */
function keyFor(context) {
  if (context.role === "player") return `player:${context.session.id}`;
  if (context.role === "screen") return `screen`;
  return `teacher`;
}

/** Atualiza a última posição de sincronização reportada por um cliente. */
export function recordClientSync(context, { roomEpoch, stateVersion }) {
  let perRoom = byRoom.get(context.room.code);
  if (!perRoom) {
    perRoom = new Map();
    byRoom.set(context.room.code, perRoom);
  }
  perRoom.set(keyFor(context), { roomEpoch, stateVersion });
}

/** Remove a entrada de um cliente (disconnect). */
export function dropClientSync(context) {
  const perRoom = byRoom.get(context.room.code);
  if (perRoom) perRoom.delete(keyFor(context));
}

/**
 * Estatística de sincronização para o painel do professor (spec 5.4):
 *  - `expected`: total de alunos Conectados + tela pública (quando conectada)
 *  - `synchronized`: quantos reportaram a versão autoritativa corrente
 *  - `stale`: quantos estão no mapa com posição inferior à corrente
 *  - `recovering`: quantos alunos conectados ainda NÃO reportaram posição
 *    nenhuma (entraram há pouco / nunca enviaram heartbeat)
 *  - `unknown`: 1 quando o professor ainda não reportou (indicador do próprio
 *    painel); o `degraded` do aluno é igual a `stale + recovering`.
 */
export function syncStats(roomCode, { totalConnected, currentEpoch, currentVersion }) {
  const perRoom = byRoom.get(roomCode);
  const expected = totalConnected ?? 0;
  const entries = perRoom ? [...perRoom.values()] : [];
  const synchronized = entries.filter(
    (entry) =>
      entry.roomEpoch === currentEpoch &&
      entry.stateVersion >= currentVersion,
  ).length;
  const knownPositions = entries.filter((entry) => entry.roomEpoch !== undefined).length;
  return {
    expected,
    synchronized,
    stale: Math.max(0, knownPositions - synchronized),
    recovering: Math.max(0, expected - knownPositions),
  };
}

/** Limpa o registro de uma sala (encerramento/restart). */
export function dropRoom(roomCode) {
  byRoom.delete(roomCode);
}

export default { recordClientSync, dropClientSync, syncStats, dropRoom };