import http from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { io as createClient } from "socket.io-client";
import { createApp } from "../../src/app.js";
import { createSocketServer } from "../../src/sockets/index.js";
import { createScenario, prisma, resetDatabase, waitForRoundStatus } from "../helpers/fixtures.js";
import authService from "../../src/services/authService.js";
import roomService from "../../src/services/roomService.js";
import roundService from "../../src/services/roundService.js";

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

/** Espera um evento especifico com timeout curto. */
function waitFor(client, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout esperando ${event}`)), timeout);
    client.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
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
});

async function joinPlayers() {
  const sessions = [];
  for (const student of scenario.students) {
    const session = await roomService.join(scenario.room.code, student.registrationNumber);
    const client = connect();
    const ack = await emit(client, "joinRoom", {
      roomCode: scenario.room.code,
      role: "player",
      playerToken: session.playerToken,
    });
    expect(ack.ok).toBe(true);
    sessions.push({ ...session, client });
  }
  return sessions;
}

async function joinTeacher() {
  const { token } = await authService.login({
    email: "professor@stop.local",
    password: "stop-admin",
  });
  const client = connect();
  const ack = await emit(client, "joinRoom", {
    roomCode: scenario.room.code,
    role: "teacher",
    adminToken: token,
  });
  expect(ack.ok).toBe(true);
  return { client, token };
}

async function joinScreen() {
  const client = connect();
  const ack = await emit(client, "joinRoom", { roomCode: scenario.room.code, role: "screen" });
  expect(ack.ok).toBe(true);
  return client;
}

describe("fluxo end-to-end via Socket.IO (spec 60)", () => {
  it("recusa entrada de aluno sem token valido (spec 34)", async () => {
    const client = connect();
    const semToken = await emit(client, "joinRoom", {
      roomCode: scenario.room.code,
      role: "player",
    });
    expect(semToken.ok).toBe(false);
    expect(semToken.error.code).toBe("UNAUTHORIZED");

    const tokenFalso = await emit(client, "joinRoom", {
      roomCode: scenario.room.code,
      role: "player",
      playerToken: "token-inventado",
    });
    expect(tokenFalso.ok).toBe(false);
  });

  it("recusa painel do professor sem credencial administrativa", async () => {
    const client = connect();
    const response = await emit(client, "joinRoom", {
      roomCode: scenario.room.code,
      role: "teacher",
    });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("UNAUTHORIZED");
  });

  it("rejeita payload malformado sem derrubar a conexao (spec 53)", async () => {
    const client = connect();
    const response = await emit(client, "joinRoom", { roomCode: "" });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("BAD_PAYLOAD");
    expect(client.connected).toBe(true);
  });

  it("nao aceita acoes de jogo antes de entrar na sala", async () => {
    const client = connect();
    const response = await emit(client, "requestStop", { roundId: 1 });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("NOT_IN_ROOM");
  });

  it("professor cria a rodada, alunos jogam, STOP encerra e o ranking aparece", async () => {
    const teacher = await joinTeacher();
    const screen = await joinScreen();
    const players = await joinPlayers();

    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
      durationSeconds: 120,
    });

    // Todos recebem a letra sorteada pelo servidor.
    const letterOnScreen = waitFor(screen, "letterSelected");
    const letterOnPlayer = waitFor(players[0].client, "letterSelected");
    await roundService.drawRoundLetter(round.id);
    const letra = (await letterOnScreen).letter;
    expect((await letterOnPlayer).letter).toBe(letra);

    const startedOnPlayers = players.map((player) => waitFor(player.client, "roundStarted"));
    const startedOnScreen = waitFor(screen, "roundStarted");
    await roundService.start(round.id);
    const started = await Promise.all(startedOnPlayers);
    expect(started[0].round.status).toBe("PLAYING");
    expect((await startedOnScreen).round.letter).toBe(letra);

    // Cada aluno preenche todas as categorias pelo socket.
    const categories = started[0].round.categories;
    for (const [index, player] of players.entries()) {
      for (const category of categories) {
        const ack = await emit(player.client, "submitAnswer", {
          roundId: round.id,
          roundCategoryId: category.id,
          value: `${letra}resposta${index}${category.id}`,
        });
        expect(ack.ok).toBe(true);
      }
    }

    const progresso = await emit(players[0].client, "submitAnswer", {
      roundId: round.id,
      roundCategoryId: categories[0].id,
      value: `${letra}eact`,
    });
    expect(progresso.data.canStop).toBe(true);
    expect(progresso.data.filled).toBe(categories.length);

    const stoppedOnScreen = waitFor(screen, "roundStopped");
    const stoppedOnTeacher = waitFor(teacher.client, "roundStopped");
    const stopAck = await emit(players[0].client, "requestStop", { roundId: round.id });
    expect(stopAck.ok).toBe(true);

    const stopped = await stoppedOnScreen;
    expect(stopped.firstStopperId).toBe(players[0].playerSessionId);
    expect((await stoppedOnTeacher).reason).toBe("STOP");

    // Depois do STOP nenhuma resposta e aceita (spec 47).
    const tarde = await emit(players[1].client, "submitAnswer", {
      roundId: round.id,
      roundCategoryId: categories[0].id,
      value: "tarde demais",
    });
    expect(tarde.ok).toBe(false);
    expect(tarde.error.code).toBe("CONFLICT");

    await roundService.closeCollaborativeCorrection(round.id);
    const rankingOnScreen = waitFor(screen, "rankingUpdated");
    await roundService.score(round.id);
    const ranking = (await rankingOnScreen).ranking;
    expect(ranking).toHaveLength(3);
    expect(ranking[0].position).toBe(1);
  });

  it("segundo STOP simultaneo recebe erro do servidor (spec 13)", async () => {
    await joinTeacher();
    const players = await joinPlayers();

    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    const { round: comLetra } = await roundService.drawRoundLetter(round.id);
    await roundService.start(round.id);
    await waitForRoundStatus(round.id, "PLAYING");

    for (const player of players.slice(0, 2)) {
      for (const category of comLetra.categories) {
        await emit(player.client, "submitAnswer", {
          roundId: round.id,
          roundCategoryId: category.id,
          value: `${comLetra.letter}${player.playerSessionId}${category.id}`,
        });
      }
    }

    const [first, second] = await Promise.all([
      emit(players[0].client, "requestStop", { roundId: round.id }),
      emit(players[1].client, "requestStop", { roundId: round.id }),
    ]);
    const okCount = [first, second].filter((response) => response.ok).length;
    expect(okCount).toBe(1);
  });

  it("saida do fullscreen elimina o aluno e avisa o cliente (spec 24 e 26)", async () => {
    const teacher = await joinTeacher();
    const players = await joinPlayers();

    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    await roundService.drawRoundLetter(round.id);
    await roundService.start(round.id);
    await waitForRoundStatus(round.id, "PLAYING");

    const eliminadoNoAluno = waitFor(players[0].client, "playerEliminated");
    const eliminadoNoProfessor = waitFor(teacher.client, "playerEliminated");
    const ack = await emit(players[0].client, "fullscreenExited", { roundId: round.id });
    expect(ack.ok).toBe(true);

    const evento = await eliminadoNoAluno;
    expect(evento.reason).toBe("FULLSCREEN_EXIT");
    expect(evento.message).toContain("eliminado desta rodada");
    expect((await eliminadoNoProfessor).playerSessionId).toBe(players[0].playerSessionId);

    const bloqueado = await emit(players[0].client, "requestStop", { roundId: round.id });
    expect(bloqueado.ok).toBe(false);
    expect(bloqueado.error.code).toBe("FORBIDDEN");
  });

  it("o aluno recupera o estado autoritativo ao reconectar (spec 45)", async () => {
    const players = await joinPlayers();
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    const { round: comLetra } = await roundService.drawRoundLetter(round.id);
    await roundService.start(round.id);
    await waitForRoundStatus(round.id, "PLAYING");

    await emit(players[0].client, "submitAnswer", {
      roundId: round.id,
      roundCategoryId: comLetra.categories[0].id,
      value: `${comLetra.letter}esposta`,
    });

    players[0].client.close();

    const reconectado = connect();
    const ack = await emit(reconectado, "joinRoom", {
      roomCode: scenario.room.code,
      role: "player",
      playerToken: players[0].playerToken,
    });
    expect(ack.ok).toBe(true);
    expect(ack.data.round.status).toBe("PLAYING");
    expect(ack.data.roundStatus).toBe("PLAYING");
    expect(ack.data.answers).toHaveLength(1);
    expect(ack.data.canAnswer).toBe(true);
  });

  it("a tela publica recebe estado sem dados privados", async () => {
    await joinPlayers();
    const screen = await joinScreen();
    const state = await emit(screen, "requestState", {});
    expect(state.ok).toBe(true);
    expect(state.data.totalPlayers).toBe(3);
    const serialized = JSON.stringify(state.data);
    for (const student of scenario.students) {
      expect(serialized).not.toContain(student.registrationNumber);
    }
  });
});
