import http from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { io as createClient } from "socket.io-client";
import { createApp } from "../../src/app.js";
import { createSocketServer } from "../../src/sockets/index.js";
import { createScenario, prisma, resetDatabase, waitForRoundStatus } from "../helpers/fixtures.js";
import { emitAck, joinTeacher, joinPlayer, joinScreen, createTestClient } from "../helpers/socket.js";
import roomService from "../../src/services/roomService.js";
import roundService from "../../src/services/roundService.js";

let server;
let ioServer;
let url;
let scenario;
let clients = [];

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
    sessions.push(await joinPlayer(url, scenario.room.code, session.playerToken, clients));
  }
  return sessions;
}

describe("fluxo end-to-end via Socket.IO (spec 60)", () => {
  it("recusa entrada de aluno sem token valido (spec 34)", async () => {
    const client = createTestClient(url, clients);
    const semToken = await emitAck(client, "joinRoom", {
      roomCode: scenario.room.code,
      role: "player",
    });
    expect(semToken.ok).toBe(false);
    expect(semToken.error.code).toBe("UNAUTHORIZED");

    const tokenFalso = await emitAck(client, "joinRoom", {
      roomCode: scenario.room.code,
      role: "player",
      playerToken: "token-inventado",
    });
    expect(tokenFalso.ok).toBe(false);
  });

  it("recusa painel do professor sem credencial administrativa", async () => {
    const client = createTestClient(url, clients);
    const response = await emitAck(client, "joinRoom", {
      roomCode: scenario.room.code,
      role: "teacher",
    });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("UNAUTHORIZED");
  });

  it("rejeita payload malformado sem derrubar a conexao (spec 53)", async () => {
    const client = createTestClient(url, clients);
    const response = await emitAck(client, "joinRoom", { roomCode: "" });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("BAD_PAYLOAD");
    expect(client.connected).toBe(true);
  });

  it("nao aceita acoes de jogo antes de entrar na sala", async () => {
    const client = createTestClient(url, clients);
    const response = await emitAck(client, "requestStop", { roundId: 1 });
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("NOT_IN_ROOM");
  });

  it("professor cria a rodada, alunos jogam, STOP encerra e o ranking aparece", async () => {
    const teacher = await joinTeacher(url, scenario.room.code, clients);
    const screen = await joinScreen(url, scenario.room.code, clients);
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
        const ack = await emitAck(player.client, "submitAnswer", {
          roundId: round.id,
          roundCategoryId: category.id,
          value: `${letra}resposta${index}${category.id}`,
        });
        expect(ack.ok).toBe(true);
      }
    }

    const progresso = await emitAck(players[0].client, "submitAnswer", {
      roundId: round.id,
      roundCategoryId: categories[0].id,
      value: `${letra}eact`,
    });
    expect(progresso.data.canStop).toBe(true);
    expect(progresso.data.filled).toBe(categories.length);

    const stoppedOnScreen = waitFor(screen, "roundStopped");
    const stoppedOnTeacher = waitFor(teacher.client, "roundStopped");
    const stopAck = await emitAck(players[0].client, "requestStop", { roundId: round.id });
    expect(stopAck.ok).toBe(true);

    const stopped = await stoppedOnScreen;
    expect(stopped.firstStopperId).toBe(players[0].playerSessionId);
    expect((await stoppedOnTeacher).reason).toBe("STOP");

    // Depois do STOP nenhuma resposta e aceita (spec 47).
    const tarde = await emitAck(players[1].client, "submitAnswer", {
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
    await joinTeacher(url, scenario.room.code, clients);
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
        await emitAck(player.client, "submitAnswer", {
          roundId: round.id,
          roundCategoryId: category.id,
          value: `${comLetra.letter}${player.playerSessionId}${category.id}`,
        });
      }
    }

    const [first, second] = await Promise.all([
      emitAck(players[0].client, "requestStop", { roundId: round.id }),
      emitAck(players[1].client, "requestStop", { roundId: round.id }),
    ]);
    const okCount = [first, second].filter((response) => response.ok).length;
    expect(okCount).toBe(1);
  });

  it("saida do fullscreen elimina o aluno e avisa o cliente (spec 24 e 26)", async () => {
    const teacher = await joinTeacher(url, scenario.room.code, clients);
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
    const ack = await emitAck(players[0].client, "fullscreenExited", { roundId: round.id });
    expect(ack.ok).toBe(true);

    const evento = await eliminadoNoAluno;
    expect(evento.reason).toBe("FULLSCREEN_EXIT");
    expect(evento.message).toContain("eliminado desta rodada");
    expect((await eliminadoNoProfessor).playerSessionId).toBe(players[0].playerSessionId);

    const bloqueado = await emitAck(players[0].client, "requestStop", { roundId: round.id });
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

    await emitAck(players[0].client, "submitAnswer", {
      roundId: round.id,
      roundCategoryId: comLetra.categories[0].id,
      value: `${comLetra.letter}esposta`,
    });

    players[0].client.close();

    const reconectado = createTestClient(url, clients);
    const ack = await emitAck(reconectado, "joinRoom", {
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

  it("reacao em emoji chega para colegas, professor e tela publica (nova feature)", async () => {
    const teacher = await joinTeacher(url, scenario.room.code, clients);
    const screen = await joinScreen(url, scenario.room.code, clients);
    const players = await joinPlayers();

    const onTeacher = waitFor(teacher.client, "emojiReceived");
    const onScreen = waitFor(screen, "emojiReceived");
    const onOtherPlayer = waitFor(players[1].client, "emojiReceived");

    const ack = await emitAck(players[0].client, "sendEmoji", { emoji: "🔥" });
    expect(ack.ok).toBe(true);

    expect((await onTeacher).emoji).toBe("🔥");
    expect((await onScreen).emoji).toBe("🔥");
    // Nunca identifica quem mandou (spec 4.3: sem dados privados na sala).
    expect((await onOtherPlayer).playerSessionId).toBeUndefined();

    // Emoji fora do conjunto fixo e rejeitado.
    const invalido = await emitAck(players[0].client, "sendEmoji", { emoji: "🍕" });
    expect(invalido.ok).toBe(false);
    expect(invalido.error.code).toBe("BAD_PAYLOAD");

    // Cooldown: reenviar rapido demais falha em silencio, sem erro (o
    // aluno nao deve ver nenhum aviso por causa disso).
    const rapido = await emitAck(players[0].client, "sendEmoji", { emoji: "👍" });
    expect(rapido.ok).toBe(true);
    expect(rapido.data.sent).toBe(false);

    // So aluno pode reagir, nunca o professor ou a tela publica.
    const doProfessor = await emitAck(teacher.client, "sendEmoji", { emoji: "👍" });
    expect(doProfessor.ok).toBe(false);
    expect(doProfessor.error.code).toBe("FORBIDDEN");
  });

  it("a tela publica recebe estado sem dados privados", async () => {
    await joinPlayers();
    const screen = await joinScreen(url, scenario.room.code, clients);
    const state = await emitAck(screen, "requestState", {});
    expect(state.ok).toBe(true);
    expect(state.data.totalPlayers).toBe(3);
    const serialized = JSON.stringify(state.data);
    for (const student of scenario.students) {
      expect(serialized).not.toContain(student.registrationNumber);
    }
  });
});
