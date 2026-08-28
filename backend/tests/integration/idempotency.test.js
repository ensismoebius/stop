import http from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createSocketServer } from "../../src/sockets/index.js";
import { createScenario, prisma, resetDatabase, waitForRoundStatus, fillAllAnswers } from "../helpers/fixtures.js";
import { emitAck, joinTeacher, joinPlayer, joinPlayerForScenario, createTestClient } from "../helpers/socket.js";
import roomService from "../../src/services/roomService.js";
import roundService from "../../src/services/roundService.js";

let server;
let ioServer;
let url;
let scenario;
let clients = [];

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

/** Cria, sorteia a letra e inicia uma rodada, esperando entrar em PLAYING. */
async function playingRound() {
  const round = await roundService.create({
    gameId: scenario.game.id,
    categorySetId: scenario.categorySet.id,
  });
  await roundService.drawRoundLetter(round.id);
  await roundService.start(round.id);
  return waitForRoundStatus(round.id, "PLAYING");
}

const processed = async () => prisma.processedOperation.findMany({ orderBy: { id: "asc" } });

describe("idempotência de comandos (spec 3.1)", () => {
  it("submitAnswer com o mesmo operationId executa uma única vez e reenvio devolve o resultado gravado", async () => {
    const player = await joinPlayerForScenario(url, clients, scenario);
    const round = await playingRound();
    const category = round.categories[0];
    const operationId = "op-submit-1";

    const first = await emitAck(player.client, "submitAnswer", {
      roundId: round.id,
      roundCategoryId: category.id,
      value: "Ariranha",
      operationId,
    });
    expect(first.ok).toBe(true);
    expect(first.data.value).toBe("Ariranha");
    expect(first.data.roundCategoryId).toBe(category.id);

    const answers = await prisma.answer.count({ where: { roundCategoryId: category.id } });
    expect(answers).toBe(1);

    // Reenvio (ack perdido / retry): mesmo id, mesmo resultado, sem
    // reexecutar — a resposta continua única no banco.
    const retry = await emitAck(player.client, "submitAnswer", {
      roundId: round.id,
      roundCategoryId: category.id,
      value: "Ariranha",
      operationId,
    });
    expect(retry.ok).toBe(true);
    expect(retry.data).toEqual(first.data);
    expect(await prisma.answer.count({ where: { roundCategoryId: category.id } })).toBe(1);

    const records = await processed();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: operationId, roomId: scenario.room.id, command: "submitAnswer", status: "DONE" });
  });

  it("ready com o mesmo operationId não atualiza a sessão duas vezes", async () => {
    const player = await joinPlayerForScenario(url, clients, scenario);
    const operationId = "op-ready-1";

    const first = await emitAck(player.client, "ready", { operationId });
    expect(first.ok).toBe(true);
    expect(first.data.status).toBe("READY");

    const retry = await emitAck(player.client, "ready", { operationId });
    expect(retry.ok).toBe(true);
    expect(retry.data).toEqual(first.data);

    const records = await processed();
    expect(records).toHaveLength(1);
    expect(records[0].command).toBe("ready");
  });

  it("requestStop com o mesmo operationId não reentra no conflito nem encerra duas vezes", async () => {
    await joinPlayerForScenario(url, clients, scenario, 0);
    const first = await joinPlayerForScenario(url, clients, scenario, 1);
    const round = await playingRound();
    await fillAllAnswers(round, first.playerSessionId, { prefix: "A" });
    const operationId = "op-stop-1";

    const stopAck = await emitAck(first.client, "requestStop", { roundId: round.id, operationId });
    expect(stopAck.ok).toBe(true);
    expect(stopAck.data.firstStopper).toBe(true);
    expect(stopAck.data.status).toBe("STOPPED");

    // reenvio com MESMO id enquanto a rodada já está fora de PLAYING: o
    // handler não roda de novo (senão daria "A rodada não está em
    // andamento") — devolve o resultado gravado.
    const retry = await emitAck(first.client, "requestStop", { roundId: round.id, operationId });
    expect(retry.ok).toBe(true);
    expect(retry.data).toEqual(stopAck.data);

    const stopped = await prisma.round.findUnique({ where: { id: round.id } });
    expect(stopped.status).not.toBe("PLAYING");
    expect(stopped.firstStopperId).toBe(first.playerSessionId);
    expect(await processed()).toHaveLength(1);
  });

  it("dois comandos concorrentes com o mesmo operationId executam o efeito uma vez", async () => {
    const player = await joinPlayerForScenario(url, clients, scenario);
    const round = await playingRound();
    const category = round.categories[0];
    const operationId = "op-concurrent-1";

    const payload = {
      roundId: round.id,
      roundCategoryId: category.id,
      value: "Tamandua",
      operationId,
    };
    const [a, b] = await Promise.all([
      emitAck(player.client, "submitAnswer", payload),
      emitAck(player.client, "submitAnswer", payload),
    ]);
    // Um dos dois pode ver um erro transiente (espera de PENDING), mas o
    // efeito só pode ter acontecido uma vez.
    expect(a.ok || b.ok).toBe(true);
    expect(await prisma.answer.count({ where: { roundCategoryId: category.id } })).toBe(1);
  });

  it("falha no comando apaga o registro — retry com o mesmo id reexecuta", async () => {
    const player = await joinPlayerForScenario(url, clients, scenario);
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    const category = await prisma.roundCategory.findFirst({ where: { roundId: round.id } });
    const operationId = "op-fail-1";

    // submitAnswer fora de PLAYING falha (AppError) — o registro é apagado.
    const failed = await emitAck(player.client, "submitAnswer", {
      roundId: round.id,
      roundCategoryId: category.id,
      value: "x",
      operationId,
    });
    expect(failed.ok).toBe(false);
    expect(await processed()).toHaveLength(0);

    // Reenvio com o mesmo id após a falha reexecuta (e falha de novo) — não
    // cola num DONE fantasma e não fica com registro órfão.
    const second = await emitAck(player.client, "submitAnswer", {
      roundId: round.id,
      roundCategoryId: category.id,
      value: "x",
      operationId,
    });
    expect(second.ok).toBe(false);
    expect(await processed()).toHaveLength(0);
  });

  it("submitReview com o mesmo operationId decide a revisão uma única vez", async () => {
    const players = [];
    for (const student of scenario.students) {
      const session = await roomService.join(scenario.room.code, student.registrationNumber);
      players.push(await joinPlayer(url, scenario.room.code, session.playerToken, clients));
    }
    const round = await playingRound();
    for (const player of players) await fillAllAnswers(round, player.playerSessionId, { prefix: "A" });

    // Imposição do STOP: o professor encerra para a correção destravar.
    await emitAck(players[0].client, "requestStop", { roundId: round.id });

    const review = await prisma.answerReview.findFirst({ where: { roundId: round.id } });
    const grader = players.find((p) => p.playerSessionId === review.graderPlayerSessionId);
    const operationId = "op-review-1";

    const first = await emitAck(grader.client, "submitReview", {
      reviewId: review.id,
      decision: "VALID",
      operationId,
    });
    expect(first.ok).toBe(true);

    const retry = await emitAck(grader.client, "submitReview", {
      reviewId: review.id,
      decision: "VALID",
      operationId,
    });
    expect(retry.ok).toBe(true);

    const reviews = await prisma.answerReview.findMany({ where: { id: review.id } });
    expect(reviews[0].decision).toBe("VALID");
    const timelines = await prisma.answerReview.findMany({
      where: { id: review.id, decision: { not: "VALID" } },
    });
    expect(timelines).toHaveLength(0);
    expect((await processed()).filter((record) => record.id === operationId)).toHaveLength(1);
  });

  it("professor não é afetado: joinRoom/requestState continuam sem operationId", async () => {
    const teacher = await joinTeacher(url, scenario.room.code, clients);
    const state = await emitAck(teacher.client, "requestState", {});
    expect(state.ok).toBe(true);
    const client = createTestClient(url, clients);
    const ack = await emitAck(client, "identifyStudent", {
      roomCode: scenario.room.code,
      registrationNumber: scenario.students[0].registrationNumber,
    });
    expect(ack.ok).toBe(true);
  });
});