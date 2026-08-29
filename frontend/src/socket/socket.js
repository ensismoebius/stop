import { io } from "socket.io-client";

const URL = import.meta.env.VITE_SOCKET_URL ?? undefined;

/**
 * Meios de transporte configuráveis (tempo-real.md #5). Padrao:
 * `["websocket","polling"]`. Em router/AP barato de sala cheio de conexoes,
 * forque com `VITE_SOCKET_TRANSPORTS=polling` no build para o jogo andar
 * por HTTP long-polling (mais robusto contra half-open) ao custo de um
 * pouco de latencia. Vazio/invalido cai no padrao.
 */
function resolveTransports() {
  const raw = import.meta.env.VITE_SOCKET_TRANSPORTS;
  if (!raw) return ["websocket", "polling"];
  const transports = String(raw)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return transports.length > 0 ? transports : ["websocket", "polling"];
}

/**
 * Conexao Socket.IO. A reconexao automatica e essencial em rede Wi-Fi de
 * sala de aula (spec 45): o cliente reentra na sala e pede o estado
 * autoritativo ao servidor.
 *
 * Backoff com jitter (randomizationFactor) para nao estampedar o
 * roteador/AP barato da sala: com 30 celulares reconectando juntos, a
 * primeira tentativa em 0,5s virava uma onda sincronizada de handshakes
 * que o Wi-Fi mal-adaptado recusava. Agora cada aparelho se afasta um
 * pouco do outro (base 2s, fator 0.7) e o teto sobe a 10s.
 */
export function createSocket() {
  return io(URL, {
    transports: resolveTransports(),
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity,
    randomizationFactor: 0.7,
    autoConnect: true,
  });
}

/** Emite com ack e devolve uma Promise. */
export function emitAck(socket, event, payload, timeout = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: { code: "TIMEOUT", message: "Sem resposta do servidor" } });
    }, timeout);

    socket.emit(event, payload, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response ?? { ok: false, error: { code: "EMPTY", message: "Resposta vazia" } });
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** operationId único por comando idempotente (spec 3.1). */
export function createOperationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Comando idempotente (spec 3.1): anexa um `operationId` ao payload e, se o
 * ack não vier (TIMEOUT — ack perdido ou resposta atrasada), reenvia com o
 * MESMO id. O servidor desduplica por `(roomId, operationId)` e devolve o
 * resultado gravado, então o reenvio nunca executa o efeito duas vezes.
 */
export function emitCommand(socket, event, payload, { timeout = 8000, retryDelay = 400 } = {}) {
  const body = { ...payload, operationId: createOperationId() };
  const attempt = async () => {
    const response = await emitAck(socket, event, body, timeout);
    if (response.ok || response.error?.code !== "TIMEOUT") return response;
    await sleep(retryDelay);
    return emitAck(socket, event, body, timeout);
  };
  return attempt();
}

export default createSocket;
