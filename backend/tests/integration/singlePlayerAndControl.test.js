import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createScenario,
  prisma,
  resetDatabase,
  startedRound as startedRoundFixture,
  fillAllAnswers,
  waitForRoundStatus,
} from "../helpers/fixtures.js";
import roomService from "../../src/services/roomService.js";
import roundService from "../../src/services/roundService.js";
import gameService from "../../src/services/gameService.js";
import viewService from "../../src/services/viewService.js";

let scenario;

const newRound = (durationSeconds) => startedRoundFixture(scenario, { durationSeconds });
const fillAll = (round, playerSessionId) => fillAllAnswers(round, playerSessionId);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("partida com um unico jogador", () => {
  let player;

  beforeEach(async () => {
    await resetDatabase();
    // Turma com um unico aluno: cenario de estudo individual.
    scenario = await createScenario({ students: ["Ana Souza"] });
    player = await roomService.join(
      scenario.room.code,
      scenario.students[0].registrationNumber,
    );
  });

  it("inicia a rodada com apenas um aluno na sala", async () => {
    const round = await newRound();
    expect(round.status).toBe("PLAYING");

    const participants = await prisma.roundParticipant.findMany({ where: { roundId: round.id } });
    expect(participants).toHaveLength(1);
    expect(participants[0].status).toBe("PLAYING");
  });

  it("percorre o ciclo completo e pontua 10 por resposta exclusiva", async () => {
    const round = await newRound();
    await fillAll(round, player.playerSessionId);

    const stopped = await roundService.requestStop({
      roundId: round.id,
      playerSessionId: player.playerSessionId,
    });
    expect(stopped.firstStopperId).toBe(player.playerSessionId);
    expect((await roundService.get(round.id)).status).toBe("CORRECTION");

    const grid = await roundService.correctionGrid(round.id);
    expect(grid.players).toHaveLength(1);
    // Sem outro aluno nao existe repeticao: nada e marcado como duplicado.
    expect(grid.players[0].answers.every((answer) => answer.duplicated === false)).toBe(true);

    const { ranking } = await roundService.score(round.id);
    expect(ranking).toHaveLength(1);
    expect(ranking[0].position).toBe(1);
    expect(ranking[0].total).toBe(round.categories.length * 10);

    const participant = await prisma.roundParticipant.findUnique({
      where: {
        roundId_playerSessionId: { roundId: round.id, playerSessionId: player.playerSessionId },
      },
    });
    expect(participant.roundScore).toBe(round.categories.length * 10);
  });

  it("acumula pontos entre rodadas do jogador solitario", async () => {
    for (let i = 0; i < 2; i += 1) {
      const round = await roundService.next({
        gameId: scenario.game.id,
        categorySetId: scenario.categorySet.id,
      });
      await roundService.drawRoundLetter(round.id);
      await roundService.start(round.id);
      const started = await waitForRoundStatus(round.id, "PLAYING");
      await fillAll(started, player.playerSessionId);
      await roundService.requestStop({
        roundId: started.id,
        playerSessionId: player.playerSessionId,
      });
      await roundService.score(started.id);
    }

    const ranking = await gameService.ranking(scenario.game.id);
    expect(ranking).toHaveLength(1);
    expect(ranking[0].total).toBe(scenario.categorySet.categories.length * 10 * 2);
  });

  it("encerra por tempo mesmo com um unico jogador", async () => {
    const round = await newRound(30);
    await prisma.round.update({
      where: { id: round.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });
    await roundService.handleTimeout(round.id);
    const stored = await roundService.get(round.id);
    expect(stored.stopReason).toBe("TIMEOUT");
    expect(["STOPPED", "CORRECTION"]).toContain(stored.status);
  });

  it("a tela publica funciona com um jogador", async () => {
    await newRound();
    const state = await viewService.publicState(scenario.room.code);
    expect(state.totalPlayers).toBe(1);
    expect(state.activePlayers).toBe(1);
    expect(state.round.status).toBe("PLAYING");
  });

  it("rejeita iniciar rodada sem nenhum aluno na sala", async () => {
    await prisma.playerSession.deleteMany({ where: { roomId: scenario.room.id } });
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    await roundService.drawRoundLetter(round.id);
    await expect(roundService.start(round.id)).rejects.toMatchObject({ status: 400 });
  });
});

describe("controle da partida pelo professor", () => {
  let players;

  beforeEach(async () => {
    await resetDatabase();
    scenario = await createScenario();
    players = [];
    for (const student of scenario.students) {
      players.push(await roomService.join(scenario.room.code, student.registrationNumber));
    }
  });

  it("cancela a rodada em qualquer estado e libera uma nova", async () => {
    for (const setup of ["CREATED", "READY", "PLAYING", "CORRECTION"]) {
      const round = await roundService.create({
        gameId: scenario.game.id,
        categorySetId: scenario.categorySet.id,
      });
      if (setup !== "CREATED") await roundService.drawRoundLetter(round.id);
      if (setup === "PLAYING" || setup === "CORRECTION") {
        await roundService.start(round.id);
        await waitForRoundStatus(round.id, "PLAYING");
      }
      if (setup === "CORRECTION") await roundService.forceStop(round.id);

      const cancelled = await roundService.cancel(round.id);
      expect(cancelled.status).toBe("FINISHED");
      expect(cancelled.stopReason).toBe("CANCELLED");
    }

    // Depois de cancelar sempre e possivel criar a proxima rodada.
    const nova = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    expect(nova.status).toBe("CREATED");
    expect(nova.roundNumber).toBe(5);
  });

  it("cancelamento nao gera pontuacao", async () => {
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    await roundService.drawRoundLetter(round.id);
    await roundService.start(round.id);
    const started = await waitForRoundStatus(round.id, "PLAYING");
    await fillAll(started, players[0].playerSessionId);

    await roundService.cancel(round.id);

    const ranking = await gameService.ranking(scenario.game.id);
    expect(ranking.every((entry) => entry.total === 0)).toBe(true);
    // As respostas continuam no banco para auditoria (spec 44).
    const answers = await prisma.answer.findMany({ where: { roundId: round.id } });
    expect(answers.length).toBeGreaterThan(0);
    expect(answers.every((answer) => answer.score === 0)).toBe(true);
  });

  it("cancelar reabilita quem foi eliminado", async () => {
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    await roundService.drawRoundLetter(round.id);
    await roundService.start(round.id);
    await waitForRoundStatus(round.id, "PLAYING");
    await roundService.eliminate({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
    });
    await roundService.cancel(round.id);

    const session = await prisma.playerSession.findUnique({
      where: { id: players[0].playerSessionId },
    });
    expect(session.status).toBe("READY");

    const proxima = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    await roundService.drawRoundLetter(proxima.id);
    await roundService.start(proxima.id);
    const started = await waitForRoundStatus(proxima.id, "PLAYING");
    const participant = await prisma.roundParticipant.findUnique({
      where: {
        roundId_playerSessionId: {
          roundId: started.id,
          playerSessionId: players[0].playerSessionId,
        },
      },
    });
    expect(participant.status).toBe("PLAYING");
  });

  it("cancelar uma rodada ja finalizada e idempotente", async () => {
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    await roundService.cancel(round.id);
    const again = await roundService.cancel(round.id);
    expect(again.status).toBe("FINISHED");
  });

  it("encerra a partida e permite comecar outra com os mesmos alunos", async () => {
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    await roundService.drawRoundLetter(round.id);
    await roundService.start(round.id);
    await waitForRoundStatus(round.id, "PLAYING");
    await roundService.forceStop(round.id);
    await roundService.closeCollaborativeCorrection(round.id);
    await roundService.score(round.id);

    const finished = await gameService.finish(scenario.game.id);
    expect(finished.status).toBe("FINISHED");
    expect(finished.finishedAt).toBeTruthy();

    // Nova partida na mesma turma, com sala propria.
    const outra = await prisma.game.create({
      data: {
        name: "Segunda partida",
        classId: scenario.turma.id,
        teacherId: scenario.teacher.id,
      },
    });
    const sala = await roomService.create(outra.id);
    const sessao = await roomService.join(
      sala.code,
      scenario.students[0].registrationNumber,
    );
    expect(sessao.playerToken).toBeTruthy();

    const novaRodada = await roundService.create({
      gameId: outra.id,
      categorySetId: scenario.categorySet.id,
    });
    await roundService.drawRoundLetter(novaRodada.id);
    await roundService.start(novaRodada.id);
    const started = await waitForRoundStatus(novaRodada.id, "PLAYING");
    expect(started.status).toBe("PLAYING");
    // O placar da nova partida comeca do zero.
    const ranking = await gameService.ranking(outra.id);
    expect(ranking.every((entry) => entry.total === 0)).toBe(true);
  });
});
