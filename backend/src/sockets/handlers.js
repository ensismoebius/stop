import logger from "../lib/logger.js";
import { AppError } from "../lib/errors.js";
import { parseSocketPayload } from "../middleware/validate.js";
import {
  socketAnswerSchema,
  socketFullscreenSchema,
  socketJoinRoomSchema,
  socketRoundSchema,
  socketTelemetrySchema,
  socketIdentifySchema,
  socketReviewSchema,
  socketEmojiSchema,
} from "../validators/schemas.js";
import { authenticateJoin } from "./socketAuth.js";
import * as realtime from "./realtime.js";
import answerService from "../services/answerService.js";
import roundService from "../services/roundService.js";
import roomService from "../services/roomService.js";
import viewService from "../services/viewService.js";
import playerSessionRepository from "../repositories/playerSessionRepository.js";
import telemetryRepository from "../repositories/telemetryRepository.js";

function toErrorPayload(error) {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message, details: error.details ?? null };
  }
  logger.error("Erro em handler de socket", error);
  return { code: "INTERNAL_ERROR", message: "Erro interno do servidor" };
}

/**
 * Envolve um handler: valida o payload, responde pelo ack e emite `error`
 * ao cliente em caso de falha. Nunca derruba a conexao.
 */
function wrap(socket, schema, fn) {
  return async (payload, ack) => {
    const parsed = schema ? parseSocketPayload(schema, payload) : { ok: true, data: payload };
    if (!parsed.ok) {
      const error = { code: "BAD_PAYLOAD", message: "Dados inválidos", details: parsed.issues };
      socket.emit("error", error);
      if (typeof ack === "function") ack({ ok: false, error });
      return;
    }
    try {
      const result = await fn(socket, parsed.data);
      if (typeof ack === "function") ack({ ok: true, data: result ?? null });
    } catch (error) {
      const payloadError = toErrorPayload(error);
      socket.emit("error", payloadError);
      if (typeof ack === "function") ack({ ok: false, error: payloadError });
    }
  };
}

function requireContext(socket) {
  if (!socket.data.context) {
    throw new AppError("Entre em uma sala antes de executar esta ação", {
      status: 403,
      code: "NOT_IN_ROOM",
    });
  }
  return socket.data.context;
}

function requirePlayer(socket) {
  const context = requireContext(socket);
  if (context.role !== "player" || !context.session) {
    throw new AppError("Ação permitida apenas para alunos", { status: 403, code: "FORBIDDEN" });
  }
  return context;
}

async function handlePlayerJoin(client, context, code) {
  await client.join(realtime.rooms.players(code));
  await client.join(realtime.rooms.player(context.session.id));
  await playerSessionRepository.markConnected(context.session.id, client.id);

  const state = await viewService.playerState(context.session.id);
  client.emit("roomState", state);
  realtime.toTeachers(code, "playerJoined", {
    playerSessionId: context.session.id,
    name: context.session.student.name,
    registrationNumber: context.session.student.registrationNumber,
  });
  await roundService.broadcastState(code);
  return state;
}

async function handleJoinRoom(client, data) {
  const context = await authenticateJoin(data);
  const code = context.room.code;

  client.data.context = context;
  await client.join(realtime.rooms.all(code));

  if (context.role === "player") return handlePlayerJoin(client, context, code);

  if (context.role === "teacher") {
    await client.join(realtime.rooms.teachers(code));
    const state = await viewService.teacherState(code);
    client.emit("roomState", state);
    return state;
  }

  await client.join(realtime.rooms.screens(code));
  const state = await viewService.publicState(code);
  client.emit("roomState", state);
  return state;
}

/** Desconexao momentanea nao elimina o aluno (spec 45) — so marca offline. */
async function handleDisconnect(socket, reason) {
  const context = socket.data.context;
  if (!context || context.role !== "player") return;
  try {
    await playerSessionRepository.markDisconnected(context.session.id);
    await telemetryRepository.record({
      type: "PLAYER_DISCONNECTED",
      roomId: context.room.id,
      playerSessionId: context.session.id,
      payload: { reason },
    });
    realtime.toTeachers(context.room.code, "playerLeft", {
      playerSessionId: context.session.id,
      reason,
    });
    await roundService.broadcastState(context.room.code);
  } catch (error) {
    logger.warn("Falha ao tratar desconexao", error?.message ?? error);
  }
}

// Cooldown por sessao para a reacao em emoji: nao persiste em banco (e
// puramente visual/efemero), so precisa evitar que um aluno consiga
// inundar a sala de eventos.
const EMOJI_COOLDOWN_MS = 800;
const lastEmojiAt = new Map();

export function registerHandlers(io, socket) {
  /** Registra um evento validado no socket corrente. */
  const on = (event, schema, fn) => socket.on(event, wrap(socket, schema, fn));

  on("joinRoom", socketJoinRoomSchema, (client, data) => handleJoinRoom(client, data));

  /** Consulta de matricula antes da confirmacao (spec 6). */
  on("identifyStudent", socketIdentifySchema, async (_client, data) =>
    roomService.identify(data.roomCode, data.registrationNumber),
  );

  on("ready", null, async (client) => {
    const context = requirePlayer(client);
    await playerSessionRepository.update(context.session.id, { status: "READY" });
    await roundService.broadcastState(context.room.code);
    return { status: "READY" };
  });

  /**
   * Reacao em emoji: efemera, nunca gravada no banco. Visivel para toda a
   * sala (colegas, professor e tela publica) — nao carrega o nome do
   * aluno no payload, so o emoji, para nao expor identidade na tela
   * publica (mesma regra de privacidade do resto da tela, spec 4.3).
   *
   * O cooldown falha em silencio (`sent: false`, sem lancar erro): e so um
   * limite tecnico contra spam de rede, nao algo que o aluno precise ver
   * como aviso/erro na tela.
   */
  on("sendEmoji", socketEmojiSchema, async (client, data) => {
    const context = requirePlayer(client);
    const now = Date.now();
    const last = lastEmojiAt.get(context.session.id) ?? 0;
    if (now - last < EMOJI_COOLDOWN_MS) return { sent: false };
    lastEmojiAt.set(context.session.id, now);
    realtime.toRoom(context.room.code, "emojiReceived", { emoji: data.emoji });
    return { sent: true };
  });

  const submitAnswer = async (client, data) => {
    const context = requirePlayer(client);
    const result = await answerService.submit({
      roundId: data.roundId,
      playerSessionId: context.session.id,
      roundCategoryId: data.roundCategoryId,
      value: data.value,
    });
    return {
      roundCategoryId: data.roundCategoryId,
      value: result.answer.value,
      filled: result.filled,
      total: result.total,
      canStop: result.canStop,
    };
  };

  on("submitAnswer", socketAnswerSchema, submitAnswer);
  on("updateAnswer", socketAnswerSchema, submitAnswer);

  /** STOP do aluno: a decisao final e do servidor (spec 12 e 13). */
  on("requestStop", socketRoundSchema, async (client, data) => {
    const context = requirePlayer(client);
    const round = await roundService.requestStop({
      roundId: data.roundId,
      playerSessionId: context.session.id,
    });
    return { roundId: round.id, status: round.status, firstStopper: true };
  });

  /** Saida do fullscreen durante PLAYING elimina o aluno (spec 24). */
  on("fullscreenExited", socketFullscreenSchema, async (client, data) => {
    const context = requirePlayer(client);
    const result = await roundService.eliminate({
      roundId: data.roundId,
      playerSessionId: context.session.id,
      reason: data.reason ?? "FULLSCREEN_EXIT",
    });
    return result ?? { ignored: true };
  });

  /** Correcao colaborativa: decisao do aluno sobre a resposta de um colega (spec 9-16, 45). */
  on("submitReview", socketReviewSchema, async (client, data) => {
    const context = requirePlayer(client);
    return roundService.submitReview({
      playerSessionId: context.session.id,
      reviewId: data.reviewId,
      decision: data.decision,
    });
  });

  /** Eventos de foco/visibilidade sao apenas telemetria (spec 25). */
  on("telemetry", socketTelemetrySchema, async (client, data) => {
    const context = requireContext(client);
    await telemetryRepository.record({
      type: data.type,
      roomId: context.room.id,
      roundId: data.roundId ?? null,
      playerSessionId: context.session?.id ?? null,
      payload: data.payload ?? null,
    });
    return { recorded: true };
  });

  /** Reconexao: o cliente pede o estado autoritativo (spec 45). */
  on("requestState", null, async (client) => {
    const context = requireContext(client);
    if (context.role === "player") return viewService.playerState(context.session.id);
    if (context.role === "teacher") return viewService.teacherState(context.room.code);
    return viewService.publicState(context.room.code);
  });

  socket.on("disconnect", (reason) => handleDisconnect(socket, reason));
}

export default registerHandlers;
