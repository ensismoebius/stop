import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createScenario,
  prisma,
  resetDatabase,
  joinAllStudents,
  startedRound as startedRoundFixture,
  fillAllAnswers,
  waitForRoundStatus,
} from "../helpers/fixtures.js";
import roundService from "../../src/services/roundService.js";
import gameService from "../../src/services/gameService.js";
import answerService from "../../src/services/answerService.js";
import viewService from "../../src/services/viewService.js";
import roomService from "../../src/services/roomService.js";
import { openCorrection } from "../../src/services/round/correction.js";
import { startCollaborativeCorrection } from "../../src/services/round/collaborativeCorrection.js";

let scenario;
let players;

const startedRound = () => startedRoundFixture(scenario);
const fillAll = (round, playerSessionId) => fillAllAnswers(round, playerSessionId);

beforeEach(async () => {
  await resetDatabase();
  scenario = await createScenario();
  players = await joinAllStudents(scenario);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("bordas da máquina de estados da rodada (guardas defensivas)", () => {
  it("next() rejeita avançar enquanto a rodada atual está em CORRECTION", async () => {
    const round = await startedRound();
    await roundService.forceStop(round.id);
    await roundService.closeCollaborativeCorrection(round.id);
    expect((await roundService.get(round.id)).status).toBe("CORRECTION");

    await expect(
      roundService.next({ gameId: scenario.game.id, categorySetId: scenario.categorySet.id }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("next() rejeita avançar enquanto a rodada atual está em PLAYING/STARTING/STOPPED", async () => {
    const round = await startedRound();
    await expect(
      roundService.next({ gameId: scenario.game.id, categorySetId: scenario.categorySet.id }),
    ).rejects.toMatchObject({ status: 409 });

    await roundService.forceStop(round.id);
    // Ainda em COLLABORATIVE_CORRECTION (nunca chegou a SCORED/CREATED/READY).
    await expect(
      roundService.next({ gameId: scenario.game.id, categorySetId: scenario.categorySet.id }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("openCorrection rejeita abrir a correção fora de COLLABORATIVE_CORRECTION", async () => {
    const round = await startedRound();
    // Ainda em PLAYING: nem passou por STOPPED/COLLABORATIVE_CORRECTION.
    await expect(openCorrection(round.id)).rejects.toMatchObject({ status: 409 });
  });

  it("startCollaborativeCorrection rejeita iniciar fora de STOPPED", async () => {
    const round = await startedRound();
    // Ainda em PLAYING.
    await expect(startCollaborativeCorrection(round)).rejects.toMatchObject({ status: 409 });
  });

  it("submitReview rejeita quando a rodada já avançou para além da correção colaborativa", async () => {
    const round = await startedRound();
    for (const player of players) await fillAll(round, player.playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });

    const review = await prisma.answerReview.findFirst({ where: { roundId: round.id } });
    await roundService.closeCollaborativeCorrection(round.id);
    await roundService.score(round.id);
    expect((await roundService.get(round.id)).status).toBe("SCORED");

    await expect(
      roundService.submitReview({
        playerSessionId: review.graderPlayerSessionId,
        reviewId: review.id,
        decision: "VALID",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("forceStop rejeita quando a rodada ainda não está em andamento", async () => {
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    await expect(roundService.forceStop(round.id)).rejects.toMatchObject({ status: 409 });
  });

  it("answerService.review rejeita corrigir uma resposta fora da fase de correção", async () => {
    const round = await startedRound();
    const submitted = await answerService.submit({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
      roundCategoryId: round.categories[0].id,
      value: `${round.letter}esposta`,
    });
    // A rodada ainda está em PLAYING: correção manual não é permitida ainda.
    await expect(answerService.review(submitted.answer.id, "VALID")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("answerService.submit rejeita quando o participante não está mais em PLAYING (estado defensivo)", async () => {
    const round = await startedRound();
    // Situação que não ocorre pelo fluxo normal (a rodada fecharia junto):
    // forçamos o status do participante via banco para exercitar a guarda.
    await prisma.roundParticipant.update({
      where: {
        roundId_playerSessionId: { roundId: round.id, playerSessionId: players[0].playerSessionId },
      },
      data: { status: "SUBMITTED" },
    });
    await expect(
      answerService.submit({
        roundId: round.id,
        playerSessionId: players[0].playerSessionId,
        roundCategoryId: round.categories[0].id,
        value: `${round.letter}esposta`,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("gameService.finish tolera a ausência de sala (best-effort no broadcast)", async () => {
    const game = await prisma.game.create({
      data: { name: "Sem sala", classId: scenario.turma.id, teacherId: scenario.teacher.id },
    });
    const finished = await gameService.finish(game.id);
    expect(finished.status).toBe("FINISHED");
  });

  it("gameService.removeRound tolera a ausência de sala no broadcast final", async () => {
    const round = await startedRound();
    await roundService.forceStop(round.id);
    await roundService.closeCollaborativeCorrection(round.id);
    await roundService.score(round.id);

    // Reatribui a rodada já pontuada a uma partida sem sala, para forçar
    // resolveRoom a falhar apenas no broadcast best-effort ao final de
    // removeRound (a remoção em si já terá sido persistida).
    const gameSemSala = await prisma.game.create({
      data: { name: "Sem sala", classId: scenario.turma.id, teacherId: scenario.teacher.id },
    });
    await prisma.round.update({ where: { id: round.id }, data: { gameId: gameSemSala.id } });

    await expect(gameService.removeRound(gameSemSala.id, round.id)).resolves.toBeUndefined();
    expect(await prisma.round.findUnique({ where: { id: round.id } })).toBeNull();
  });

  it("join reaproveita uma sessão WAITING e a promove para READY", async () => {
    const student = scenario.students[0];
    const first = await roomService.join(scenario.room.code, student.registrationNumber);
    await prisma.playerSession.update({
      where: { id: first.playerSessionId },
      data: { status: "WAITING" },
    });

    const second = await roomService.join(scenario.room.code, student.registrationNumber);
    expect(second.playerSessionId).toBe(first.playerSessionId);
    const stored = await prisma.playerSession.findUnique({ where: { id: first.playerSessionId } });
    expect(stored.status).toBe("READY");
  });

  it("viewService.playerState inclui as avaliações atribuídas durante a correção colaborativa", async () => {
    const round = await startedRound();
    for (const player of players) await fillAll(round, player.playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });
    expect((await roundService.get(round.id)).status).toBe("COLLABORATIVE_CORRECTION");

    const review = await prisma.answerReview.findFirst({ where: { roundId: round.id } });
    const state = await viewService.playerState(review.graderPlayerSessionId);
    expect(state.reviews.length).toBeGreaterThan(0);
    expect(state.reviews[0]).toMatchObject({ reviewId: expect.any(Number), decision: "PENDING" });
  });
});
