import logger from "../lib/logger.js";
import { AppError } from "../lib/errors.js";
import { parseSocketPayload } from "../middleware/validate.js";
import {
  socketAnswerSchema,
  socketFullscreenSchema,
  socketJoinRoomSchema,
  socketReadySchema,
  socketRoundSchema,
  socketTelemetrySchema,
  socketIdentifySchema,
  socketReviewSchema,
  socketEmojiSchema,
  socketHeartbeatSchema,
} from "../validators/schemas.js";
import { authenticateJoin } from "./socketAuth.js";
import * as realtime from "./realtime.js";
import answerService from "../services/answerService.js";
import roundService from "../services/roundService.js";
import roomService from "../services/roomService.js";
import viewService from "../services/viewService.js";
import roomState from "../services/room/roomState.js";
import roomRepository from "../repositories/roomRepository.js";
import playerSessionRepository from "../repositories/playerSessionRepository.js";
import telemetryRepository from "../repositories/telemetryRepository.js";
import { recordClientSync, dropClientSync, syncStats as syncStatsFor } from "./syncRegistry.js";
import claimOperation from "../services/operations.js";

/** Converte qualquer erro em payload serializavel de resposta ao cliente. */
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
 *
 * Com `options.idempotent`, o `operationId` é extraído do payload ANTES da
 * validação (zod por padrão descarta chaves desconhecidas) e o comando é
 * executado via `claimOperation`: um reenvio com o mesmo id devolve o
 * resultado gravado em vez de reexecutar (spec 3.1). Sem `operationId`
 * cai no caminho antigo — compatível com clientes legados.
 */
function wrap(socket, schema, handler, options = {}) {
  return async (payload, ack) => {
    const operationId =
      options.idempotent && typeof payload?.operationId === "string" && payload.operationId.trim()
        ? payload.operationId.trim()
        : null;
    const parsed = schema ? parseSocketPayload(schema, payload) : { valid: true, data: payload };
    if (!parsed.valid) {
      const error = { code: "BAD_PAYLOAD", message: "Dados inválidos", details: parsed.issues };
      socket.emit("error", error);
      if (typeof ack === "function") ack({ ok: false, error });
      return;
    }
    try {
      let result;
      if (operationId) {
        const context = requireContext(socket);
        result = await claimOperation(
          {
            operationId,
            roomId: context.room.id,
            playerSessionId: context.session?.id ?? null,
            command: options.command,
          },
          () => handler(socket, parsed.data),
        );
      } else {
        result = await handler(socket, parsed.data);
      }
      if (typeof ack === "function") ack({ ok: true, data: result ?? null });
    } catch (error) {
      const payloadError = toErrorPayload(error);
      socket.emit("error", payloadError);
      if (typeof ack === "function") ack({ ok: false, error: payloadError });
    }
  };
}

/** Recupera o contexto de sala gravado no socket; lance erro quando ausente. */
function requireContext(socket) {
  if (!socket.data.context) {
    throw new AppError("Entre em uma sala antes de executar esta ação", {
      status: 403,
      code: "NOT_IN_ROOM",
    });
  }
  return socket.data.context;
}

/** Exige que o socket pertenca a um aluno (sessao ativa) e devolve o contexto. */
function requirePlayer(socket) {
  const context = requireContext(socket);
  if (context.role !== "player" || !context.session) {
    throw new AppError("Ação permitida apenas para alunos", { status: 403, code: "FORBIDDEN" });
  }
  return context;
}

/** Entrada de aluno: vincula salas, marca conectado e devolve o estado inicial dele. */
async function handlePlayerJoin(client, context, code) {
  await client.join(realtime.rooms.players(code));
  await client.join(realtime.rooms.player(context.session.id));
  await playerSessionRepository.markConnected(context.session.id, client.id);

  // O ack de entrada carrega a posição (roomEpoch, stateVersion) corrente:
  // é o primeiro estado que o barreira de sincronização do cliente adota.
  const state = await viewService.playerState(
    context.session.id,
    await roomRepository.getVersion(context.room.id),
  );
  client.emit("roomState", state);
  realtime.toTeachers(code, "playerJoined", {
    playerSessionId: context.session.id,
    name: context.session.student.name,
    registrationNumber: context.session.student.registrationNumber,
  });
  // Coalescido: dezenas de alunos entrando em rajada nao devem disparar
  // uma difusao completa cada um (fixme.md #2). O cliente recém-entrado ja
  // recebeu o proprio estado no ack/imediato acima.
  roundService.broadcastStateSoon(code);
  return state;
}

/** Entrada em sala: autentica, vincula salas por papel e entrega o estado inicial. */
async function handleJoinRoom(client, data) {
  const context = await authenticateJoin(data);
  const code = context.room.code;

  client.data.context = context;
  await client.join(realtime.rooms.all(code));

  if (context.role === "player") return handlePlayerJoin(client, context, code);

  const version = await roomRepository.getVersion(context.room.id);

  if (context.role === "teacher") {
    await client.join(realtime.rooms.teachers(code));
    const state = await viewService.teacherState(code, { version });
    state.syncStats = syncStatsFor(context.room.code, version);
    client.emit("roomState", state);
    return state;
  }

  await client.join(realtime.rooms.screens(code));
  const state = await viewService.publicState(code, { version });
  client.emit("roomState", state);
  return state;
}

/** Desconexao momentanea nao elimina o aluno (spec 45) — so marca offline. */
async function handleDisconnect(socket, reason) {
  const context = socket.data.context;
  if (!context || context.role !== "player") return;

  // "Sempre a sessao mais recente vence": quando um socket antigo desconecta
  // depois de uma conexao nova ja ter assumido a sessao, esta desconexao nao
  // pode (a) zerar o socketId da sessao nem (b) apagar a entrada de
  // sincronizacao/avisar "playerLeft" como se o aluno tivesse saido — a
  // conexao mais nova ainda esta viva e e a dona legitima da sessao.
  let stillCurrent = true;
  try {
    const result = await playerSessionRepository.markDisconnected(context.session.id, socket.id);
    // updateMany devolve quantas linhas casaram com `{id, socketId}`: 0
    // significa que a sessao ja e de outro socket mais novo.
    stillCurrent = result?.count !== 0;
    await telemetryRepository.record({
      type: "PLAYER_DISCONNECTED",
      roomId: context.room.id,
      playerSessionId: context.session.id,
      payload: { reason },
    });
  } catch (error) {
    // Escrita falhou (conflito transiente 1020 apos retries): nao sabemos
    // se este socket ainda era o dono — segue com a limpeza como failsafe.
    logger.warn("Falha ao tratar desconexao no banco", error?.message ?? error);
  }

  if (stillCurrent) {
    dropClientSync(context);
    realtime.toTeachers(context.room.code, "playerLeft", {
      playerSessionId: context.session.id,
      reason,
    });
  }
  // Coalescido e barato: recalcula o painel do professor com o estado real.
  roundService.broadcastStateSoon(context.room.code);
}

/** Consulta de matricula antes da confirmacao (spec 6). */
async function handleIdentifyStudent(_client, data) {
  return roomService.identify(data.roomCode, data.registrationNumber);
}

/** Marca o aluno como pronto para comecar a rodada (spec 6/10). */
async function handleReady(client) {
  const context = requirePlayer(client);
  await playerSessionRepository.update(context.session.id, { status: "READY" });
  // Coalescido pelo mesmo motivo do join: a classe inteira manda `ready`
  // no mesmo segundo em que entra na tela do jogo (fixme.md #2).
  roundService.broadcastStateSoon(context.room.code);
  return { status: "READY" };
}

// Cooldown por sessao para a reacao em emoji: nao persiste em banco (e
// puramente visual/efemero), so precisa evitar que um aluno consiga
// inundar a sala de eventos.
const EMOJI_COOLDOWN_MS = 800;
const lastEmojiAt = new Map();

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
async function handleSendEmoji(client, data) {
  const context = requirePlayer(client);
  const now = Date.now();
  const last = lastEmojiAt.get(context.session.id) ?? 0;
  if (now - last < EMOJI_COOLDOWN_MS) return { sent: false };
  lastEmojiAt.set(context.session.id, now);
  realtime.toRoom(context.room.code, "emojiReceived", { emoji: data.emoji });
  return { sent: true };
}

/** Envia uma resposta da rodada corrente e devolve o novo total do aluno. */
async function handleSubmitAnswer(client, data) {
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
}

/** STOP do aluno: a decisao final e do servidor (spec 12 e 13). */
async function handleRequestStop(client, data) {
  const context = requirePlayer(client);
  const round = await roundService.requestStop({
    roundId: data.roundId,
    playerSessionId: context.session.id,
  });
  return { roundId: round.id, status: round.status, firstStopper: true };
}

/** Saida do fullscreen durante PLAYING elimina o aluno (spec 24). */
async function handleFullscreenExited(client, data) {
  const context = requirePlayer(client);
  const result = await roundService.eliminate({
    roundId: data.roundId,
    playerSessionId: context.session.id,
    reason: data.reason ?? "FULLSCREEN_EXIT",
  });
  return result ?? { ignored: true };
}

/** Correcao colaborativa: decisao do aluno sobre a resposta de um colega (spec 9-16, 45). */
async function handleSubmitReview(client, data) {
  const context = requirePlayer(client);
  return roundService.submitReview({
    playerSessionId: context.session.id,
    reviewId: data.reviewId,
    decision: data.decision,
  });
}

/** Eventos de foco/visibilidade sao apenas telemetria (spec 25). */
async function handleTelemetry(client, data) {
  const context = requireContext(client);
  await telemetryRepository.record({
    type: data.type,
    roomId: context.room.id,
    roundId: data.roundId ?? null,
    playerSessionId: context.session?.id ?? null,
    payload: data.payload ?? null,
  });
  return { recorded: true };
}

/**
 * Reconexão: o cliente pede o estado autoritativo (spec 45), enviando a
 * posição `(roomEpoch, stateVersion)` que já adotou.
 *
 *  - Mesma posição (ou mais nova) → `CURRENT`: nada novo a enviar, o
 *    cliente permanece no que já tem (economia de banda no watchdog de
 *    dezenas de alunos em fases de espera).
 *  - Posição antiga / não informada → `ROOM_STATE`: o snapshot autoritativo
 *    completo, com as versões anexadas, para a barreira adotar.
 */
async function handleRequestState(client, request) {
  const context = requireContext(client);
  const snapshot = await roomState.getCurrent(context.room.code);
  const current = snapshot
    ? { roomEpoch: snapshot.roomEpoch, stateVersion: snapshot.stateVersion }
    : await roomRepository.getVersion(context.room.id);

  let clientPosition = null;
  if (request && typeof request.roomEpoch === "number" && typeof request.stateVersion === "number") {
    clientPosition = { roomEpoch: request.roomEpoch, stateVersion: request.stateVersion };
  }
  // Best-effort: só é útil para o monitor do professor quando o cliente
  // reporta posição; sem posição = acabou de entrar, não registra.
  if (clientPosition) recordClientSync(context, clientPosition);

  if (
    clientPosition &&
    snapshot &&
    clientPosition.roomEpoch === snapshot.roomEpoch &&
    clientPosition.stateVersion >= snapshot.stateVersion
  ) {
    return {
      status: "CURRENT",
      roomEpoch: snapshot.roomEpoch,
      stateVersion: snapshot.stateVersion,
      serverTime: new Date().toISOString(),
    };
  }

  const state = roomState.roleStateFor(context, snapshot);
  const serverTime = new Date().toISOString();
  if (!state) return { status: "ROOM_STATE", roomEpoch: current.roomEpoch, stateVersion: current.stateVersion, serverTime };
  return { ...state, status: "ROOM_STATE", serverTime };
}

/**
 * Heartbeat da aplicação (spec 8.3): o cliente reporta a posição que
 * adotou; o servidor devolve a posição autoritativa corrente. Sem troca
 * de estado — só "CURRENT" ou "você está atrás, peça o estado".
 */
async function handleApplicationHeartbeat(client, request) {
  const context = requireContext(client);
  const position = await roomRepository.getVersion(context.room.id);
  let clientPosition = null;
  let stale = false;
  if (request && typeof request.roomEpoch === "number" && typeof request.stateVersion === "number") {
    clientPosition = { roomEpoch: request.roomEpoch, stateVersion: request.stateVersion };
    stale =
      clientPosition.roomEpoch < position.roomEpoch ||
      (clientPosition.roomEpoch === position.roomEpoch && clientPosition.stateVersion < position.stateVersion);
  }
  if (clientPosition) recordClientSync(context, clientPosition);
  return {
    serverTime: new Date().toISOString(),
    roomEpoch: position.roomEpoch,
    stateVersion: position.stateVersion,
    stale,
  };
}

/** Registra no socket corrente os handlers validados de cada evento do protocolo. */
export function registerHandlers(socket) {
  /** Registra um evento validado no socket corrente. */
  const registerEvent = (event, schema, handler, options = {}) =>
    socket.on(event, wrap(socket, schema, handler, { ...options, command: options.command ?? event }));

  registerEvent("joinRoom", socketJoinRoomSchema, handleJoinRoom);
  registerEvent("identifyStudent", socketIdentifySchema, handleIdentifyStudent);
  // Comandos de escrita com idempotência (spec 3.1): o cliente gera um
  // `operationId` e o servidor desduplica reenvios (ack perdido / retry).
  registerEvent("ready", socketReadySchema, handleReady, { idempotent: true });
  registerEvent("sendEmoji", socketEmojiSchema, handleSendEmoji);
  registerEvent("submitAnswer", socketAnswerSchema, handleSubmitAnswer, { idempotent: true });
  registerEvent("updateAnswer", socketAnswerSchema, handleSubmitAnswer, { idempotent: true });
  registerEvent("requestStop", socketRoundSchema, handleRequestStop, { idempotent: true });
  registerEvent("fullscreenExited", socketFullscreenSchema, handleFullscreenExited, { idempotent: true });
  registerEvent("submitReview", socketReviewSchema, handleSubmitReview, { idempotent: true });
  registerEvent("telemetry", socketTelemetrySchema, handleTelemetry);
  registerEvent("requestState", null, handleRequestState);
  registerEvent("applicationHeartbeat", socketHeartbeatSchema, handleApplicationHeartbeat);

  socket.on("disconnect", (reason) => handleDisconnect(socket, reason));
}

export default registerHandlers;
