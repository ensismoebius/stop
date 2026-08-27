import { io as createClient } from "socket.io-client";
import authService from "../../src/services/authService.js";

/**
 * Emite um evento e aguarda o ack com timeout.
 * @param {Socket} client - Cliente Socket.IO
 * @param {string} event - Nome do evento
 * @param {object} payload - Dados do evento
 * @param {number} timeoutMs - Timeout em ms (padrão 5000)
 * @returns {Promise<object>} Resposta do ack
 */
export function emitAck(client, event, payload, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout no ack de ${event}`)), timeoutMs);
    client.emit(event, payload, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

/**
 * Cria um cliente Socket.IO conectado ao servidor de teste.
 * @param {string} url - URL do servidor
 * @param {Array} clients - Array para rastrear clientes (será limpo no afterEach)
 * @returns {Socket} Cliente Socket.IO conectado
 */
export function createTestClient(url, clients) {
  const client = createClient(url, { transports: ["websocket"], forceNew: true });
  clients.push(client);
  return client;
}

/**
 * Entra como professor na sala de teste.
 * @param {string} url - URL do servidor
 * @param {string} roomCode - Código da sala
 * @param {Array} clients - Array para rastrear clientes
 * @returns {Promise<{client: Socket, token: string}>}
 */
export async function joinTeacher(url, roomCode, clients) {
  const { token } = await authService.login({
    email: "professor@stop.local",
    password: "stop-admin",
  });
  const client = createTestClient(url, clients);
  const ack = await emitAck(client, "joinRoom", {
    roomCode,
    role: "teacher",
    adminToken: token,
  });
  if (!ack.ok) throw new Error("Falha ao entrar como professor");
  return { client, token };
}

/**
 * Entra como aluno na sala de teste.
 * @param {string} url - URL do servidor
 * @param {string} roomCode - Código da sala
 * @param {string} playerToken - Token do jogador
 * @param {Array} clients - Array para rastrear clientes
 * @returns {Promise<{client: Socket, playerSessionId: string, playerToken: string}>}
 */
export async function joinPlayer(url, roomCode, playerToken, clients) {
  const client = createTestClient(url, clients);
  const ack = await emitAck(client, "joinRoom", {
    roomCode,
    role: "player",
    playerToken,
  });
  if (!ack.ok) throw new Error("Falha ao entrar como aluno");
  return { client, playerSessionId: ack.data.playerSessionId, playerToken };
}

/**
 * Entra como tela pública na sala de teste.
 * @param {string} url - URL do servidor
 * @param {string} roomCode - Código da sala
 * @param {Array} clients - Array para rastrear clientes
 * @returns {Promise<Socket>}
 */
export async function joinScreen(url, roomCode, clients) {
  const client = createTestClient(url, clients);
  const ack = await emitAck(client, "joinRoom", { roomCode, role: "screen" });
  if (!ack.ok) throw new Error("Falha ao entrar como tela pública");
  return client;
}
