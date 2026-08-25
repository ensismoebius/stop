import { io } from "socket.io-client";

const URL = import.meta.env.VITE_SOCKET_URL ?? undefined;

/**
 * Conexao Socket.IO. A reconexao automatica e essencial em rede Wi-Fi de
 * sala de aula (spec 45): o cliente reentra na sala e pede o estado
 * autoritativo ao servidor.
 */
export function createSocket() {
  return io(URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    reconnectionAttempts: Infinity,
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

export default createSocket;
