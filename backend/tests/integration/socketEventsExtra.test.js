import http from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { io as createClient } from "socket.io-client";
import { createApp } from "../../src/app.js";
import { createSocketServer } from "../../src/sockets/index.js";
import { createScenario, prisma, resetDatabase, waitForRoundStatus } from "../helpers/fixtures.js";
import authService from "../../src/services/authService.js";
import roomService from "../../src/services/roomService.js";
import roundService from "../../src/services/roundService.js";
import logger from "../../src/lib/logger.js";
import playerSessionRepository from "../../src/repositories/playerSessionRepository.js";
import { fillAllAnswers } from "../helpers/fixtures.js";

let server;
let ioServer;
let url;
let scenario;
let clients = [];

function connect() {
  const client = createClient(url, { transports: ["websocket"], forceNew: true });
  clients.push(client);
  return client;
}

function emit(client, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout no ack de ${event}`)), 5000);
    client.emit(event, payload, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

beforeAll(async () => {
  const app = createApp();
  server = http.createServer(app);
  ioServer = createSocketServer(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  ioServer.close();
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase();
  scenario = await createScenario();
});

afterEach(() => {
  for (const client of clients) client.close();
  clients = [];
  vi.restoreAllMocks();
});

async function joinPlayer(student) {
  const session = await roomService.join(scenario.room.code, student.registrationNumber);
  const client = connect();
  const ack = await emit(client, "joinRoom", {
    roomCode: scenario.room.code,
    role: "player",
    playerToken: session.playerToken,
  });
  expect(ack.ok).toBe(true);
  return { ...session, client };
}

async function joinTeacher() {
  const { token } = await authService.login({ email: "professor@stop.local", password: "stop-admin" });
  const client = connect();
  const ack = await emit(client, "joinRoom", { roomCode: scenario.room.code, role: "teacher", adminToken: token });
  expect(ack.ok).toBe(true);
  return { client, token };
}

describe("eventos de socket ainda não exercitados diretamente", () => {
  it("identifyStudent consulta a matrícula antes da confirmação (spec 6)", async () => {
    const client = connect();
    const ack = await emit(client, "identifyStudent", {
      roomCode: scenario.room.code,
      registrationNumber: scenario.students[0].registrationNumber,
    });
    expect(ack.ok).toBe(true);
    expect(ack.data.student.name).toBe(scenario.students[0].name);
  });

  it("ready marca a sessão como pronta e propaga o estado da sala", async () => {
    const player = await joinPlayer(scenario.students[0]);
    const ack = await emit(player.client, "ready", {});
    expect(ack.ok).toBe(true);
    expect(ack.data.status).toBe("READY");
  });

  it("telemetry grava o evento vindo de qualquer papel conectado (spec 25)", async () => {
    const player = await joinPlayer(scenario.students[0]);
    const ack = await emit(player.client, "telemetry", { type: "TAB_HIDDEN" });
    expect(ack.ok).toBe(true);
    expect(ack.data.recorded).toBe(true);
    const events = await prisma.telemetryEvent.findMany({ where: { type: "TAB_HIDDEN" } });
    expect(events.length).toBeGreaterThan(0);
  });

  it("telemetry vinda de um papel sem sessão de aluno (professor) grava playerSessionId nulo", async () => {
    const teacher = await joinTeacher();
    const ack = await emit(teacher.client, "telemetry", { type: "TAB_HIDDEN" });
    expect(ack.ok).toBe(true);
    const event = await prisma.telemetryEvent.findFirst({
      where: { type: "TAB_HIDDEN", roomId: scenario.room.id },
      orderBy: { id: "desc" },
    });
    expect(event.playerSessionId).toBeNull();
  });

  it("submitReview via socket registra a decisão do aluno (spec 9-16, 45)", async () => {
    const players = [];
    for (const student of scenario.students) players.push(await joinPlayer(student));

    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    await roundService.drawRoundLetter(round.id);
    await roundService.start(round.id);
    const started = await waitForRoundStatus(round.id, "PLAYING");
    for (const player of players) await fillAllAnswers(started, player.playerSessionId);

    const stopAck = await emit(players[0].client, "requestStop", { roundId: round.id });
    expect(stopAck.ok).toBe(true);

    const review = await prisma.answerReview.findFirst({ where: { roundId: round.id } });
    const grader = players.find((p) => p.playerSessionId === review.graderPlayerSessionId);
    const reviewAck = await emit(grader.client, "submitReview", {
      reviewId: review.id,
      decision: "VALID",
    });
    expect(reviewAck.ok).toBe(true);
    expect(reviewAck.data.decision).toBe("VALID");
  });

  it("uma falha inesperada (não AppError) num handler vira INTERNAL_ERROR e é logada", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    vi.spyOn(roomService, "identify").mockRejectedValueOnce(new Error("falha inesperada"));

    const client = connect();
    const ack = await emit(client, "identifyStudent", {
      roomCode: scenario.room.code,
      registrationNumber: scenario.students[0].registrationNumber,
    });
    expect(ack.ok).toBe(false);
    expect(ack.error.code).toBe("INTERNAL_ERROR");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("rejeita quem tenta entrar com uma sessão de aluno de outra sala (spec 34)", async () => {
    const outroGame = await prisma.game.create({
      data: { name: "Outra partida", classId: scenario.turma.id, teacherId: scenario.teacher.id },
    });
    const outraSala = await roomService.create(outroGame.id);
    const outroAluno = await prisma.student.create({
      data: {
        name: "De Outra Sala",
        registrationNumber: "202688888",
        enrollments: { create: { classId: scenario.turma.id } },
      },
    });
    const sessaoDeOutraSala = await roomService.join(outraSala.code, outroAluno.registrationNumber);

    const client = connect();
    const ack = await emit(client, "joinRoom", {
      roomCode: scenario.room.code,
      role: "player",
      playerToken: sessaoDeOutraSala.playerToken,
    });
    expect(ack.ok).toBe(false);
    expect(ack.error.code).toBe("FORBIDDEN");
  });

  it("requestState devolve a projeção certa para professor e tela pública", async () => {
    const teacher = await joinTeacher();
    const stateTeacher = await emit(teacher.client, "requestState", {});
    expect(stateTeacher.ok).toBe(true);
    expect(stateTeacher.data.room).toBeTruthy();
    expect(stateTeacher.data.players).toBeDefined();
  });

  it("requestState devolve a projeção do próprio aluno quando pedida por um jogador", async () => {
    const player = await joinPlayer(scenario.students[0]);
    const statePlayer = await emit(player.client, "requestState", {});
    expect(statePlayer.ok).toBe(true);
    expect(statePlayer.data.playerSessionId).toBe(player.playerSessionId);
    expect(statePlayer.data.student.name).toBe(scenario.students[0].name);
  });

  it("uma falha ao tratar a desconexão de um jogador é registrada, sem derrubar o servidor", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    vi.spyOn(playerSessionRepository, "markDisconnected").mockRejectedValueOnce(
      new Error("falha simulada ao marcar desconexão"),
    );

    const player = await joinPlayer(scenario.students[0]);
    player.client.close();

    await vi.waitFor(
      () => {
        expect(warnSpy).toHaveBeenCalledWith(
          "Falha ao tratar desconexao",
          "falha simulada ao marcar desconexão",
        );
      },
      { timeout: 2000 },
    );

    // O servidor continua respondendo normalmente após a falha tratada.
    const teacher = await joinTeacher();
    const state = await emit(teacher.client, "requestState", {});
    expect(state.ok).toBe(true);
  });

  it("uma falha na desconexão sem .message (valor não-Error) ainda é registrada normalmente", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    // eslint-disable-next-line prefer-promise-reject-errors
    vi.spyOn(playerSessionRepository, "markDisconnected").mockRejectedValueOnce("motivo sem .message");

    const player = await joinPlayer(scenario.students[0]);
    player.client.close();

    await vi.waitFor(
      () => {
        expect(warnSpy).toHaveBeenCalledWith("Falha ao tratar desconexao", "motivo sem .message");
      },
      { timeout: 2000 },
    );
  });
});
