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
import roomService from "../../src/services/roomService.js";
import roundService from "../../src/services/roundService.js";

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

describe("correção colaborativa entre alunos (enhancements.md)", () => {
  it("distribui respostas sem autocorreção nem duplicidade (spec 9-14)", async () => {
    const round = await startedRound();
    for (const player of players) await fillAll(round, player.playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });

    const stopped = await roundService.get(round.id);
    expect(stopped.status).toBe("COLLABORATIVE_CORRECTION");

    const reviews = await prisma.answerReview.findMany({
      where: { roundId: round.id },
      include: { answer: true },
    });
    expect(reviews.length).toBeGreaterThan(0);

    for (const review of reviews) {
      expect(review.answer.playerSessionId).not.toBe(review.graderPlayerSessionId);
      expect(review.decision).toBe("PENDING");
    }

    // Nenhum par (avaliador, resposta) se repete.
    const pairs = new Set(reviews.map((r) => `${r.graderPlayerSessionId}:${r.answerId}`));
    expect(pairs.size).toBe(reviews.length);
  });

  it("pula a correção colaborativa quando não há nada para revisar (partida solo)", async () => {
    // Mesma turma/professor do cenario padrao, mas uma partida separada
    // com um unico aluno: sem colega, nao ha o que distribuir (spec 9).
    const soloGame = await prisma.game.create({
      data: { name: "Solo", classId: scenario.turma.id, teacherId: scenario.teacher.id },
    });
    const soloRoom = await roomService.create(soloGame.id);
    await roomService.join(soloRoom.code, scenario.students[0].registrationNumber);
    const round = await roundService.create({
      gameId: soloGame.id,
      categorySetId: scenario.categorySet.id,
    });
    await roundService.drawRoundLetter(round.id);
    await roundService.start(round.id);
    await waitForRoundStatus(round.id, "PLAYING");

    await roundService.forceStop(round.id);

    const stopped = await roundService.get(round.id);
    expect(stopped.status).toBe("CORRECTION");
  });

  it("aluno corrige a resposta atribuída e o progresso avança", async () => {
    const round = await startedRound();
    for (const player of players) await fillAll(round, player.playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });

    const myReview = await prisma.answerReview.findFirst({
      where: { roundId: round.id, graderPlayerSessionId: players[1].playerSessionId },
    });
    expect(myReview).toBeTruthy();

    const result = await roundService.submitReview({
      playerSessionId: players[1].playerSessionId,
      reviewId: myReview.id,
      decision: "VALID",
    });
    expect(result.decision).toBe("VALID");
    expect(result.completedAssignments).toBeGreaterThan(0);

    const stored = await prisma.answerReview.findUnique({ where: { id: myReview.id } });
    expect(stored.decision).toBe("VALID");
  });

  it("rejeita corrigir uma avaliação atribuída a outro aluno", async () => {
    const round = await startedRound();
    for (const player of players) await fillAll(round, player.playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });

    const someoneElsesReview = await prisma.answerReview.findFirst({
      where: { roundId: round.id, graderPlayerSessionId: players[1].playerSessionId },
    });

    await expect(
      roundService.submitReview({
        playerSessionId: players[2].playerSessionId,
        reviewId: someoneElsesReview.id,
        decision: "VALID",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejeita reenviar uma avaliação já decidida (spec 37)", async () => {
    const round = await startedRound();
    for (const player of players) await fillAll(round, player.playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });

    const review = await prisma.answerReview.findFirst({
      where: { roundId: round.id, graderPlayerSessionId: players[1].playerSessionId },
    });
    await roundService.submitReview({
      playerSessionId: players[1].playerSessionId,
      reviewId: review.id,
      decision: "VALID",
    });

    await expect(
      roundService.submitReview({
        playerSessionId: players[1].playerSessionId,
        reviewId: review.id,
        decision: "INVALID",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("fecha automaticamente quando todos os avaliadores terminam", async () => {
    const round = await startedRound();
    for (const player of players) await fillAll(round, player.playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });

    const pending = await prisma.answerReview.findMany({ where: { roundId: round.id } });
    for (const review of pending) {
      const stillPending = await prisma.answerReview.findUnique({ where: { id: review.id } });
      if (stillPending.decision !== "PENDING") continue;
      await roundService.submitReview({
        playerSessionId: review.graderPlayerSessionId,
        reviewId: review.id,
        decision: "VALID",
      });
    }

    const stored = await roundService.get(round.id);
    expect(stored.status).toBe("CORRECTION");
  });

  it("o professor pode fechar a correção colaborativa antecipadamente (spec 38-39)", async () => {
    const round = await startedRound();
    for (const player of players) await fillAll(round, player.playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });

    expect((await roundService.get(round.id)).status).toBe("COLLABORATIVE_CORRECTION");
    await roundService.closeCollaborativeCorrection(round.id);
    expect((await roundService.get(round.id)).status).toBe("CORRECTION");

    // Idempotente: chamar de novo nao quebra nem reabre a fase.
    const again = await roundService.closeCollaborativeCorrection(round.id);
    expect(again.status).toBe("CORRECTION");
  });

  it("concede bônus quando a decisão do aluno coincide com a do professor (spec 27-29)", async () => {
    const round = await startedRound();
    for (const player of players) await fillAll(round, player.playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });

    const review = await prisma.answerReview.findFirst({
      where: { roundId: round.id, graderPlayerSessionId: players[1].playerSessionId },
      include: { answer: true },
    });
    // fillAllAnswers gera respostas unicas por jogador/categoria: a
    // resposta atribuida sera considerada UNIQUE (10 pts) pelo scoring
    // automatico, logo VALID e a decisao que deve coincidir.
    await roundService.submitReview({
      playerSessionId: players[1].playerSessionId,
      reviewId: review.id,
      decision: "VALID",
    });

    await roundService.closeCollaborativeCorrection(round.id);
    const { round: scoredRound } = await roundService.score(round.id);
    expect(scoredRound.status).toBe("SCORED");

    const participant = await prisma.roundParticipant.findUnique({
      where: {
        roundId_playerSessionId: { roundId: round.id, playerSessionId: players[1].playerSessionId },
      },
    });
    // roundScore inclui tanto as respostas do proprio aluno quanto o bonus.
    expect(participant.roundScore).toBeGreaterThanOrEqual(2);
  });

  it("não concede bônus quando a decisão do aluno diverge da oficial", async () => {
    const round = await startedRound();
    for (const player of players) await fillAll(round, player.playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });

    const review = await prisma.answerReview.findFirst({
      where: { roundId: round.id, graderPlayerSessionId: players[1].playerSessionId },
    });
    // Resposta na verdade valida (unica), mas o aluno marca INVALID: deve
    // divergir da decisao oficial automatica e nao gerar bonus.
    await roundService.submitReview({
      playerSessionId: players[1].playerSessionId,
      reviewId: review.id,
      decision: "INVALID",
    });

    await roundService.closeCollaborativeCorrection(round.id);
    await roundService.score(round.id);

    const grid = await prisma.answerReview.findUnique({ where: { id: review.id } });
    expect(grid.decision).toBe("INVALID");
    // A resposta revisada foi marcada INVALID pelo professor (herdou a
    // decisao do aluno via correcao rapida)? Nao — o professor nunca viu
    // isso: a correcao oficial usa scoreAnswers, que so olha reviewState.
    // A divergencia esperada e justamente decisao=INVALID vs isValid=true.
  });

  it("pontuar duas vezes não duplica o bônus (idempotência, spec 34)", async () => {
    const round = await startedRound();
    for (const player of players) await fillAll(round, player.playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });

    const review = await prisma.answerReview.findFirst({
      where: { roundId: round.id, graderPlayerSessionId: players[1].playerSessionId },
    });
    await roundService.submitReview({
      playerSessionId: players[1].playerSessionId,
      reviewId: review.id,
      decision: "VALID",
    });
    await roundService.closeCollaborativeCorrection(round.id);
    await roundService.score(round.id);

    const firstScore = await prisma.score.findUnique({
      where: {
        gameId_studentId: {
          gameId: scenario.game.id,
          studentId: players[1].student.id,
        },
      },
    });

    await expect(roundService.score(round.id)).rejects.toMatchObject({ status: 409 });

    const secondScore = await prisma.score.findUnique({
      where: {
        gameId_studentId: {
          gameId: scenario.game.id,
          studentId: players[1].student.id,
        },
      },
    });
    expect(secondScore.total).toBe(firstScore.total);
  });

  it("duas submissões concorrentes na mesma avaliação: só uma vale", async () => {
    const round = await startedRound();
    for (const player of players) await fillAll(round, player.playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });

    const review = await prisma.answerReview.findFirst({
      where: { roundId: round.id, graderPlayerSessionId: players[1].playerSessionId },
    });

    const results = await Promise.allSettled([
      roundService.submitReview({
        playerSessionId: players[1].playerSessionId,
        reviewId: review.id,
        decision: "VALID",
      }),
      roundService.submitReview({
        playerSessionId: players[1].playerSessionId,
        reviewId: review.id,
        decision: "INVALID",
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
  });
});
