import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as realtime from "../../src/sockets/realtime.js";
import {
  createScenario,
  prisma,
  resetDatabase,
  joinAllStudents,
  startedRound,
  fillAllAnswers,
} from "../helpers/fixtures.js";
import roundService from "../../src/services/roundService.js";
import gameService from "../../src/services/gameService.js";
import answerService from "../../src/services/answerService.js";
import viewService from "../../src/services/viewService.js";
import roomService from "../../src/services/roomService.js";

let scenario;
let players;

beforeEach(async () => {
  await resetDatabase();
  scenario = await createScenario();
  players = await joinAllStudents(scenario);
});

afterAll(async () => {
  await prisma.$disconnect();
});

const roomOf = (gameId) => prisma.room.findFirst({ where: { gameId } });

/**
 * "Finalizar partida" precisa acender o podio nas TRES superficies (tela
 * publica, aluno conectado, aluno que recarrega a pagina depois). Cada uma
 * le o ranking de um caminho diferente do viewService, entao cada uma
 * ganha sua propria assercao — ja houve regressao em que a tela publica
 * mostrava o podio e a do aluno nao.
 */
describe("podio apos Finalizar partida (spec 42/44)", () => {
  it("entrega status FINISHED e ranking para a tela publica e para os alunos", async () => {
    const round = await startedRound(scenario);
    for (const player of players) {
      await fillAllAnswers(round, player.playerSessionId);
    }
    await roundService.forceStop(round.id);
    await roundService.closeCollaborativeCorrection(round.id);
    await roundService.score(round.id);

    await gameService.finish(scenario.game.id);
    const room = await roomOf(scenario.game.id);

    // 1. Tela publica (TV).
    const publicView = await viewService.publicState(room.code);
    expect(publicView.game.status).toBe("FINISHED");
    expect(publicView.ranking.length).toBeGreaterThan(0);
    expect(publicView.ranking[0].position).toBe(1);

    // 2. Aluno conectado no instante da finalizacao (broadcast em lote).
    const states = await viewService.playerStatesForRoom(room.code);
    for (const state of states.values()) {
      expect(state.game.status).toBe("FINISHED");
      expect(state.ranking.length).toBeGreaterThan(0);
    }

    // 3. Aluno que recarrega a pagina depois do fim (caminho REST).
    const solo = await viewService.playerState(players[0].playerSessionId);
    expect(solo.game.status).toBe("FINISHED");
    expect(solo.ranking.length).toBeGreaterThan(0);
  });

  it("finaliza mesmo sem nenhuma rodada jogada, mas o ranking fica vazio (ninguem participou)", async () => {
    // "Finalizar partida" pode ser clicado a qualquer momento — inclusive
    // antes de qualquer rodada. Entrar na sala ja cria um Score zerado
    // (para o placar existir assim que a primeira rodada comecar), mas
    // sem nenhuma rodada ter rodado de fato ninguem "participou": o
    // ranking (e o GameResult persistido) devem ficar vazios, em vez de
    // dar uma colocacao vazia para quem so entrou na sala.
    await gameService.finish(scenario.game.id);
    const room = await roomOf(scenario.game.id);

    const publicView = await viewService.publicState(room.code);
    expect(publicView.game.status).toBe("FINISHED");
    expect(publicView.ranking).toHaveLength(0);

    const solo = await viewService.playerState(players[0].playerSessionId);
    expect(solo.game.status).toBe("FINISHED");
    expect(solo.ranking).toHaveLength(0);

    const results = await prisma.gameResult.findMany({ where: { gameId: scenario.game.id } });
    expect(results).toHaveLength(0);
  });

  it("encerra de fato a partida: rodada em andamento fecha, sala fecha, aluno nao responde mais", async () => {
    // "Finalizar partida" so mexia na tabela Game: a rodada seguia PLAYING,
    // a sala seguia OPEN e os alunos continuavam respondendo — a partida
    // "terminava" sem terminar.
    const round = await startedRound(scenario);
    expect(round.status).toBe("PLAYING");

    await gameService.finish(scenario.game.id);

    const afterRound = await prisma.round.findUnique({ where: { id: round.id } });
    const room = await roomOf(scenario.game.id);
    expect(afterRound.status).toBe("FINISHED");
    expect(room.status).toBe("CLOSED");

    await expect(
      answerService.submit({
        roundId: round.id,
        playerSessionId: players[0].playerSessionId,
        roundCategoryId: round.categories[0].id,
        value: `${round.letter}teste`,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("nao diz ao aluno que a rodada foi cancelada — a partida foi finalizada", async () => {
    // Fechar a rodada em andamento reusa o mesmo mecanismo de cancelar, e
    // por isso o aluno via "O professor cancelou esta rodada" ao final da
    // partida: mensagem errada para o que de fato aconteceu.
    const round = await startedRound(scenario);
    const spy = vi.spyOn(realtime, "toRoom");

    await gameService.finish(scenario.game.id);

    const avisos = spy.mock.calls.filter((call) => call[1] === "roundCancelled");
    for (const aviso of avisos) {
      expect(aviso[2].message).not.toMatch(/cancelou/i);
      expect(aviso[2].message).toMatch(/encerrada/i);
    }
    spy.mockRestore();
  });

  it("cancelar uma rodada de verdade continua avisando que foi cancelada", async () => {
    const round = await startedRound(scenario);
    const spy = vi.spyOn(realtime, "toRoom");

    await roundService.cancel(round.id);

    const avisos = spy.mock.calls.filter((call) => call[1] === "roundCancelled");
    expect(avisos[0][2].message).toMatch(/cancelou/i);
    spy.mockRestore();
  });

  it("nao deixa criar nova rodada numa partida ja finalizada", async () => {
    await gameService.finish(scenario.game.id);
    await expect(
      roundService.create({
        gameId: scenario.game.id,
        categorySetId: scenario.categorySet.id,
        durationSeconds: 60,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("persiste GameResult com medalha para os tres primeiros", async () => {
    const round = await startedRound(scenario);
    for (const player of players) {
      await fillAllAnswers(round, player.playerSessionId);
    }
    await roundService.forceStop(round.id);
    await roundService.closeCollaborativeCorrection(round.id);
    await roundService.score(round.id);

    await gameService.finish(scenario.game.id);
    const results = await prisma.gameResult.findMany({
      where: { gameId: scenario.game.id },
      orderBy: { position: "asc" },
    });
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      const expected = { 1: "GOLD", 2: "SILVER", 3: "BRONZE" }[result.position] ?? null;
      expect(result.medal).toBe(expected);
    }
  });

  it("aluno que so entrou na sala mas nunca participou de rodada nenhuma nao recebe colocacao (bug reportado)", async () => {
    // Entrar na sala cria um Score zerado na hora (para o placar ja
    // existir se o aluno acompanhar a proxima rodada) — mas esse aluno
    // entrou depois que a unica rodada da partida ja tinha comecado, e por
    // isso nunca ganhou um RoundParticipant. Ele nao pode aparecer no
    // ranking com uma colocacao que nao significa nada.
    const round = await startedRound(scenario);
    for (const player of players) {
      await fillAllAnswers(round, player.playerSessionId);
    }
    await roundService.forceStop(round.id);
    await roundService.closeCollaborativeCorrection(round.id);
    await roundService.score(round.id);

    const retardatario = await prisma.student.create({
      data: {
        name: "Chegou Tarde",
        registrationNumber: "202688888",
        enrollments: { create: { classId: scenario.turma.id } },
      },
    });
    const sessaoRetardataria = await roomService.join(scenario.room.code, retardatario.registrationNumber);
    expect(await prisma.score.findUnique({
      where: { gameId_studentId: { gameId: scenario.game.id, studentId: retardatario.id } },
    })).not.toBeNull();
    expect(await prisma.roundParticipant.findFirst({
      where: { playerSessionId: sessaoRetardataria.playerSessionId },
    })).toBeNull();

    await gameService.finish(scenario.game.id);
    const room = await roomOf(scenario.game.id);

    const publicView = await viewService.publicState(room.code);
    expect(publicView.ranking.some((entry) => entry.studentId === retardatario.id)).toBe(false);
    expect(publicView.ranking.length).toBe(players.length);

    const results = await prisma.gameResult.findMany({ where: { gameId: scenario.game.id } });
    expect(results.some((result) => result.studentId === retardatario.id)).toBe(false);
  });
});
