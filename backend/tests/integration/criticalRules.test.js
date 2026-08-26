import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createScenario,
  prisma,
  resetDatabase,
  joinAllStudents,
  startedRound as startedRoundFixture,
  fillAllAnswers,
} from "../helpers/fixtures.js";
import roomService from "../../src/services/roomService.js";
import roundService, { lockKey } from "../../src/services/roundService.js";
import answerService from "../../src/services/answerService.js";
import roundRepository, { roundParticipantRepository } from "../../src/repositories/roundRepository.js";
import gameLock from "../../src/lib/asyncLock.js";

let scenario;
let players;

const startedRound = (durationSeconds) => startedRoundFixture(scenario, { durationSeconds });
const fillAll = (round, playerSessionId) => fillAllAnswers(round, playerSessionId);

beforeEach(async () => {
  await resetDatabase();
  scenario = await createScenario();
  players = await joinAllStudents(scenario);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("testes criticos (spec 61)", () => {
  it("STOP sem completar respostas e rejeitado", async () => {
    const round = await startedRound();
    // Preenche apenas a primeira categoria.
    await answerService.submit({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
      roundCategoryId: round.categories[0].id,
      value: `${round.letter}eact`,
    });

    await expect(
      roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId }),
    ).rejects.toMatchObject({ status: 400 });

    const unchanged = await roundService.get(round.id);
    expect(unchanged.status).toBe("PLAYING");
  });

  it("respostas apenas com espacos nao habilitam o STOP", async () => {
    const round = await startedRound();
    for (const category of round.categories) {
      await answerService.submit({
        roundId: round.id,
        playerSessionId: players[0].playerSessionId,
        roundCategoryId: category.id,
        value: "   ",
      });
    }
    await expect(
      roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("dois STOP simultaneos produzem apenas um vencedor", async () => {
    const round = await startedRound();
    await fillAll(round, players[0].playerSessionId);
    await fillAll(round, players[1].playerSessionId);

    const results = await Promise.allSettled([
      roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId }),
      roundService.requestStop({ roundId: round.id, playerSessionId: players[1].playerSessionId }),
    ]);

    const winners = results.filter((result) => result.status === "fulfilled");
    expect(winners).toHaveLength(1);

    const stored = await roundService.get(round.id);
    expect(stored.firstStopperId).not.toBeNull();
    expect([players[0].playerSessionId, players[1].playerSessionId]).toContain(stored.firstStopperId);

    // Quem deu o STOP tambem precisa alcancar um status terminal, nao
    // ficar parado em SUBMITTED enquanto os demais viram FINISHED.
    const winnerParticipant = await roundParticipantRepository.find(
      round.id,
      stored.firstStopperId,
    );
    expect(winnerParticipant.status).toBe("FINISHED");
  });

  it("a transicao condicional do STOP so pode ser reivindicada uma vez", async () => {
    const round = await startedRound();
    const first = await roundRepository.transitionIfStatus(round.id, "PLAYING", {
      status: "STOPPED",
      stoppedAt: new Date(),
      firstStopperId: players[0].playerSessionId,
    });
    const second = await roundRepository.transitionIfStatus(round.id, "PLAYING", {
      status: "STOPPED",
      stoppedAt: new Date(),
      firstStopperId: players[1].playerSessionId,
    });
    expect(first.count).toBe(1);
    expect(second.count).toBe(0);
  });

  it("resposta enviada apos o STOP e rejeitada (spec 47)", async () => {
    const round = await startedRound();
    await fillAll(round, players[0].playerSessionId);
    await roundService.requestStop({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
    });

    await expect(
      answerService.submit({
        roundId: round.id,
        playerSessionId: players[1].playerSessionId,
        roundCategoryId: round.categories[0].id,
        value: "tarde demais",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("STOP apos o timeout e rejeitado (spec 14)", async () => {
    const round = await startedRound(30);
    await fillAll(round, players[0].playerSessionId);

    // Simula o fim do tempo sem esperar o cronometro real.
    await prisma.round.update({
      where: { id: round.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });

    await expect(
      roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId }),
    ).rejects.toMatchObject({ status: 409 });

    const stored = await roundService.get(round.id);
    expect(stored.stopReason).toBe("TIMEOUT");
    expect(stored.firstStopperId).toBeNull();
    // Respostas existentes sao preservadas.
    const answers = await prisma.answer.findMany({
      where: { roundId: round.id, playerSessionId: players[0].playerSessionId },
    });
    expect(answers.filter((answer) => answer.value !== "")).toHaveLength(round.categories.length);
  });

  it("resposta apos o timeout e rejeitada", async () => {
    const round = await startedRound(30);
    await prisma.round.update({
      where: { id: round.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    await expect(
      answerService.submit({
        roundId: round.id,
        playerSessionId: players[0].playerSessionId,
        roundCategoryId: round.categories[0].id,
        value: "atrasada",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("o cronometro do servidor encerra a rodada automaticamente", async () => {
    const round = await startedRound(15);
    await prisma.round.update({
      where: { id: round.id },
      data: { endsAt: new Date(Date.now() - 1) },
    });
    await roundService.handleTimeout(round.id);
    const stored = await roundService.get(round.id);
    expect(["STOPPED", "CORRECTION"]).toContain(stored.status);
    expect(stored.stopReason).toBe("TIMEOUT");
  });

  it("saida do fullscreen elimina o aluno da rodada (spec 24)", async () => {
    const round = await startedRound();
    const result = await roundService.eliminate({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
      reason: "FULLSCREEN_EXIT",
    });
    expect(result).toMatchObject({ reason: "FULLSCREEN_EXIT" });

    const participant = await prisma.roundParticipant.findUnique({
      where: {
        roundId_playerSessionId: { roundId: round.id, playerSessionId: players[0].playerSessionId },
      },
    });
    expect(participant.status).toBe("ELIMINATED");

    const session = await prisma.playerSession.findUnique({
      where: { id: players[0].playerSessionId },
    });
    expect(session.status).toBe("ELIMINATED");
  });

  it("aluno eliminado nao consegue responder", async () => {
    const round = await startedRound();
    await roundService.eliminate({ roundId: round.id, playerSessionId: players[0].playerSessionId });
    await expect(
      answerService.submit({
        roundId: round.id,
        playerSessionId: players[0].playerSessionId,
        roundCategoryId: round.categories[0].id,
        value: "tentativa",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("aluno eliminado nao consegue pressionar STOP", async () => {
    const round = await startedRound();
    await fillAll(round, players[0].playerSessionId);
    await roundService.eliminate({ roundId: round.id, playerSessionId: players[0].playerSessionId });
    await expect(
      roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("aluno eliminado nao pontua e sai da grade de correcao (spec 26)", async () => {
    const round = await startedRound();
    await fillAll(round, players[0].playerSessionId);
    await fillAll(round, players[1].playerSessionId);
    await roundService.eliminate({ roundId: round.id, playerSessionId: players[0].playerSessionId });
    await roundService.forceStop(round.id);

    const grid = await roundService.correctionGrid(round.id);
    expect(grid.players.map((player) => player.playerSessionId)).not.toContain(
      players[0].playerSessionId,
    );
    expect(grid.eliminated.map((player) => player.playerSessionId)).toContain(
      players[0].playerSessionId,
    );

    await roundService.closeCollaborativeCorrection(round.id);
    await roundService.score(round.id);
    const participant = await prisma.roundParticipant.findUnique({
      where: {
        roundId_playerSessionId: { roundId: round.id, playerSessionId: players[0].playerSessionId },
      },
    });
    expect(participant.roundScore).toBe(0);
  });

  it("um aluno de fora da rodada nao consegue responder", async () => {
    const round = await startedRound();
    const novoAluno = await prisma.student.create({
      data: {
        name: "Atrasado",
        registrationNumber: "202699999",
        enrollments: { create: { classId: scenario.turma.id } },
      },
    });
    const sessao = await roomService.join(scenario.room.code, novoAluno.registrationNumber);
    await expect(
      answerService.submit({
        roundId: round.id,
        playerSessionId: sessao.playerSessionId,
        roundCategoryId: round.categories[0].id,
        value: "sem participacao",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("nao aceita categoria de outra rodada", async () => {
    const round = await startedRound();
    await expect(
      answerService.submit({
        roundId: round.id,
        playerSessionId: players[0].playerSessionId,
        roundCategoryId: 999999,
        value: "categoria invalida",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("nao permite pontuar duas vezes a mesma rodada", async () => {
    const round = await startedRound();
    await fillAll(round, players[0].playerSessionId);
    await roundService.forceStop(round.id);
    await roundService.closeCollaborativeCorrection(round.id);
    await roundService.score(round.id);
    await expect(roundService.score(round.id)).rejects.toMatchObject({ status: 409 });
  });

  it("resposta que cai bem no fechamento da rodada (STOP concorrente) e rejeitada, nunca gravada", async () => {
    const round = await startedRound();
    const category = round.categories[0];

    // Segura a mesma trava que requestStop/forceStop/handleTimeout usam,
    // simulando um fechamento de rodada "por dentro" enquanto um submit
    // esta parado na fila esperando a secao critica.
    let releaseHeld;
    let signalAcquired;
    const acquired = new Promise((resolve) => (signalAcquired = resolve));
    const held = gameLock.run(lockKey(round.id), () => {
      signalAcquired();
      return new Promise((resolve) => (releaseHeld = resolve));
    });
    // `asyncLock.run` faz `await previous` antes de chamar a task, entao a
    // trava nunca e adquirida de forma sincrona. Sem esperar aqui, o
    // `releaseHeld()` la embaixo podia rodar antes da atribuicao e quebrar
    // o teste com "releaseHeld is not a function" — uma corrida do proprio
    // teste, dependente da carga da maquina, nao um bug do produto.
    await acquired;

    const submitPromise = answerService.submit({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
      roundCategoryId: category.id,
      value: `${round.letter}teste`,
    });

    // Da tempo do submit passar pelas checagens sem trava (round ainda
    // PLAYING) e ficar enfileirado atras do `held` acima.
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Fecha a rodada "por baixo do tapete", como um forceStop concorrente
    // faria, e so entao libera a trava para o submit seguir.
    await roundRepository.transitionIfStatus(round.id, "PLAYING", {
      status: "STOPPED",
      stoppedAt: new Date(),
      stopReason: "TEACHER",
    });
    releaseHeld();
    await held;

    await expect(submitPromise).rejects.toMatchObject({ status: 409 });

    const stored = await answerService.listByRound(round.id);
    const leaked = stored.find(
      (answer) =>
        answer.roundCategoryId === category.id && answer.playerSessionId === players[0].playerSessionId,
    );
    expect(leaked).toBeUndefined();
  });

  it("nao permite reabrir uma rodada finalizada (spec 32)", async () => {
    const round = await startedRound();
    await roundService.forceStop(round.id);
    await roundService.score(round.id);
    await roundService.finish(round.id);
    await expect(roundService.start(round.id)).rejects.toMatchObject({
      code: "INVALID_ROUND_TRANSITION",
    });
  });
});
