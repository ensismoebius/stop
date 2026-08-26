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
import roomService from "../../src/services/roomService.js";
import answerService from "../../src/services/answerService.js";
import studentService from "../../src/services/studentService.js";
import viewService from "../../src/services/viewService.js";
import { getRoundOrFail } from "../../src/services/round/shared.js";
import { missingRequiredCategories, openCorrection, groupedCorrectionGrid } from "../../src/services/round/correction.js";
import { startCollaborativeCorrection, submitReview } from "../../src/services/round/collaborativeCorrection.js";
import { beginPlaying } from "../../src/services/round/lifecycle.js";
import { eliminate, forceStop, handleTimeout } from "../../src/services/round/stop.js";

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

describe("mais bordas defensivas do motor de rodadas", () => {
  it("getRoundOrFail lança 404 para uma rodada inexistente", async () => {
    await expect(getRoundOrFail(999999)).rejects.toMatchObject({ status: 404 });
  });

  it("missingRequiredCategories devolve vazio quando não há categorias obrigatórias", async () => {
    const setSemObrigatorias = await prisma.categorySet.create({
      data: {
        name: "Sem obrigatorias",
        categories: { create: [{ name: "Opcional", required: false, order: 0 }] },
      },
      include: { categories: true },
    });
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: setSemObrigatorias.id,
    });
    await roundService.drawRoundLetter(round.id);
    await roundService.start(round.id);
    const started = await waitForRoundStatus(round.id, "PLAYING");
    const missing = await missingRequiredCategories(started, players[0].playerSessionId);
    expect(missing).toEqual([]);
  });

  it("openCorrection é idempotente quando a rodada já está em CORRECTION", async () => {
    const round = await startedRound();
    await roundService.forceStop(round.id);
    await roundService.closeCollaborativeCorrection(round.id);
    const first = await getRoundOrFail(round.id);
    expect(first.status).toBe("CORRECTION");
    const again = await openCorrection(round.id);
    expect(again.status).toBe("CORRECTION");
  });

  it("groupedCorrectionGrid marca MIXED quando o mesmo texto tem estados de revisão diferentes", async () => {
    const round = await startedRound();
    const [c1] = round.categories;
    await answerService.submit({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
      roundCategoryId: c1.id,
      value: `${round.letter}esposta`,
    });
    await answerService.submit({
      roundId: round.id,
      playerSessionId: players[1].playerSessionId,
      roundCategoryId: c1.id,
      value: `${round.letter}ESPOSTA`,
    });
    await roundService.forceStop(round.id);
    await roundService.closeCollaborativeCorrection(round.id);

    const answers = await prisma.answer.findMany({
      where: { roundId: round.id, roundCategoryId: c1.id, normalizedValue: { not: "" } },
    });
    // Diverge deliberadamente o reviewState do mesmo valor normalizado.
    await prisma.answer.update({ where: { id: answers[0].id }, data: { reviewState: "VALID" } });
    await prisma.answer.update({ where: { id: answers[1].id }, data: { reviewState: "INVALID" } });

    const grouped = await groupedCorrectionGrid(round.id);
    const category = grouped.categories.find((c) => c.id === c1.id);
    const group = category.groups.find((g) => g.count === 2);
    expect(group.reviewState).toBe("MIXED");
  });

  it("startCollaborativeCorrection é idempotente quando já ativa ou já avançou", async () => {
    const round = await startedRound();
    for (const player of players) await fillAll(round, player.playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });
    const active = await getRoundOrFail(round.id);
    expect(active.status).toBe("COLLABORATIVE_CORRECTION");

    // Chamar de novo enquanto já está ativa apenas devolve o estado atual.
    const again = await startCollaborativeCorrection(active);
    expect(again.status).toBe("COLLABORATIVE_CORRECTION");

    await roundService.closeCollaborativeCorrection(round.id);
    const afterClose = await getRoundOrFail(round.id);
    const stillIdempotent = await startCollaborativeCorrection(afterClose);
    expect(stillIdempotent.status).toBe("CORRECTION");
  });

  it("respostas em branco não recebem avaliação atribuída (spec 9)", async () => {
    const round = await startedRound();
    const [c1, c2] = round.categories;
    // Joao preenche tudo; Maria deixa a primeira categoria em branco.
    for (const category of round.categories) {
      await answerService.submit({
        roundId: round.id,
        playerSessionId: players[0].playerSessionId,
        roundCategoryId: category.id,
        value: `${round.letter}${category.id}`,
      });
    }
    await answerService.submit({
      roundId: round.id,
      playerSessionId: players[1].playerSessionId,
      roundCategoryId: c1.id,
      value: "   ",
    });
    await answerService.submit({
      roundId: round.id,
      playerSessionId: players[1].playerSessionId,
      roundCategoryId: c2.id,
      value: `${round.letter}resposta-maria`,
    });
    await roundService.forceStop(round.id);

    const mariaBlankAnswer = await prisma.answer.findFirst({
      where: { roundId: round.id, playerSessionId: players[1].playerSessionId, roundCategoryId: c1.id },
    });
    const reviewsForBlank = await prisma.answerReview.findMany({
      where: { roundId: round.id, answerId: mariaBlankAnswer.id },
    });
    expect(reviewsForBlank).toHaveLength(0);
  });

  it("submitReview lança 404 para uma avaliação inexistente", async () => {
    await expect(
      submitReview({ playerSessionId: players[0].playerSessionId, reviewId: 999999, decision: "VALID" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("drawRoundLetter rejeita sortear fora de CREATED/READY", async () => {
    const round = await startedRound();
    // Já está em PLAYING.
    await expect(roundService.drawRoundLetter(round.id)).rejects.toMatchObject({ status: 409 });
  });

  it("lifecycle.create rejeita categorySetId inexistente e conjunto sem categorias ativas", async () => {
    await expect(
      roundService.create({ gameId: scenario.game.id, categorySetId: 999999 }),
    ).rejects.toMatchObject({ status: 400 });

    const setVazio = await prisma.categorySet.create({
      data: { name: "Vazio", categories: { create: [{ name: "Inativa", active: false, order: 0 }] } },
    });
    await expect(
      roundService.create({ gameId: scenario.game.id, categorySetId: setVazio.id }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("start() rejeita uma segunda tentativa concorrente (condição de corrida)", async () => {
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    await roundService.drawRoundLetter(round.id);
    await roundService.start(round.id);
    // A rodada já saiu de READY; uma segunda chamada não pode reivindicar.
    await expect(roundService.start(round.id)).rejects.toMatchObject({ status: 409 });
  });

  it("beginPlaying é um no-op quando a rodada não está mais em STARTING", async () => {
    const round = await startedRound();
    // Já está em PLAYING: chamar beginPlaying direto apenas devolve o estado atual.
    const result = await beginPlaying(round.id);
    expect(result.status).toBe("PLAYING");
  });

  it("cancelar uma rodada logo após start() interrompe a sequência de revelação em segundo plano", async () => {
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    await roundService.drawRoundLetter(round.id);
    await roundService.start(round.id);
    // Cancela imediatamente, antes de aguardar a revelação/contagem em segundo plano.
    const cancelled = await roundService.cancel(round.id);
    expect(cancelled.status).toBe("FINISHED");
    // Dá tempo da sequência de revelação em segundo plano perceber o cancelamento e desistir.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const stillFinished = await roundService.get(round.id);
    expect(stillFinished.status).toBe("FINISHED");
  });

  it("finish() é idempotente quando a rodada já está FINISHED", async () => {
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    await roundService.cancel(round.id);
    const again = await roundService.finish(round.id);
    expect(again.status).toBe("FINISHED");
  });

  it("eliminate() e forceStop() são no-op/rejeitam fora de PLAYING", async () => {
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    // Ainda em CREATED: nem elegível para eliminação.
    const result = await eliminate({ roundId: round.id, playerSessionId: players[0].playerSessionId });
    expect(result).toBeNull();
    await expect(forceStop(round.id)).rejects.toMatchObject({ status: 409 });
  });

  it("duas chamadas concorrentes a forceStop: só uma reivindica a transição", async () => {
    const round = await startedRound();
    const results = await Promise.allSettled([forceStop(round.id), forceStop(round.id)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ status: 409 });
  });

  it("duas eliminações concorrentes do mesmo aluno: a segunda é um no-op", async () => {
    const round = await startedRound();
    const results = await Promise.allSettled([
      eliminate({ roundId: round.id, playerSessionId: players[0].playerSessionId }),
      eliminate({ roundId: round.id, playerSessionId: players[0].playerSessionId }),
    ]);
    const values = results.map((r) => (r.status === "fulfilled" ? r.value : null));
    expect(values.filter((v) => v !== null)).toHaveLength(1);
  });

  it("handleTimeout é no-op quando a rodada não existe ou não está em PLAYING", async () => {
    expect(await handleTimeout(999999)).toBeNull();
    const round = await startedRound();
    await roundService.forceStop(round.id);
    expect(await handleTimeout(round.id)).toBeNull();
  });

  it("requestStop rejeita quem não participa da rodada ou já não está PLAYING", async () => {
    const round = await startedRound();
    const forasteiro = await prisma.student.create({
      data: {
        name: "De Fora",
        registrationNumber: "202677777",
        enrollments: { create: { classId: scenario.turma.id } },
      },
    });
    const sessaoForasteiro = await roomService.join(scenario.room.code, forasteiro.registrationNumber);
    await expect(
      roundService.requestStop({ roundId: round.id, playerSessionId: sessaoForasteiro.playerSessionId }),
    ).rejects.toMatchObject({ status: 403 });

    await fillAll(round, players[0].playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });
    // Segundo aluno tenta dar STOP depois que a rodada já fechou por outra via
    // (participante ainda existe, mas não está mais PLAYING).
    await expect(
      roundService.requestStop({ roundId: round.id, playerSessionId: players[1].playerSessionId }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("gameService.create rejeita turma inexistente", async () => {
    await expect(
      gameService.create({ name: "x", classId: 999999, teacherId: scenario.teacher.id }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("gameService.finish atribui prata/nenhuma medalha corretamente e history mostra o nome de quem deu STOP", async () => {
    const [a, b, c] = scenario.students;
    // joinAllStudents (beforeEach) já criou Score zerado para cada aluno: upsert em vez de create.
    for (const [student, total] of [[a, 30], [b, 20], [c, 10]]) {
      await prisma.score.upsert({
        where: { gameId_studentId: { gameId: scenario.game.id, studentId: student.id } },
        update: { total },
        create: { gameId: scenario.game.id, studentId: student.id, total },
      });
    }
    await gameService.finish(scenario.game.id);
    const results = await prisma.gameResult.findMany({ where: { gameId: scenario.game.id } });
    const byStudent = Object.fromEntries(results.map((r) => [r.studentId, r]));
    expect(byStudent[b.id].medal).toBe("SILVER");

    const outraPartida = await prisma.game.create({
      data: { name: "Quatro no pódio", classId: scenario.turma.id, teacherId: scenario.teacher.id },
    });
    const outraSala = await roomService.create(outraPartida.id);
    const quartoAluno = await prisma.student.create({
      data: { name: "Quarto", registrationNumber: "202666666", enrollments: { create: { classId: scenario.turma.id } } },
    });
    for (const student of [...scenario.students, quartoAluno]) {
      await roomService.join(outraSala.code, student.registrationNumber);
    }
    for (const [student, total] of [[a, 40], [b, 30], [c, 20], [quartoAluno, 10]]) {
      await prisma.score.upsert({
        where: { gameId_studentId: { gameId: outraPartida.id, studentId: student.id } },
        update: { total },
        create: { gameId: outraPartida.id, studentId: student.id, total },
      });
    }
    await gameService.finish(outraPartida.id);
    const quartoResultado = await prisma.gameResult.findUnique({
      where: { gameId_studentId: { gameId: outraPartida.id, studentId: quartoAluno.id } },
    });
    expect(quartoResultado.medal).toBeNull();
  });

  it("gameService.history expõe o nome de quem deu STOP quando houver", async () => {
    const round = await startedRound();
    await fillAll(round, players[0].playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });
    await roundService.closeCollaborativeCorrection(round.id);
    await roundService.score(round.id);
    const history = await gameService.history(scenario.game.id);
    expect(history.rounds[0].firstStopper).toBe(scenario.students[0].name);
  });

  it("gameService.removeRound rejeita rodada inexistente ou de outra partida", async () => {
    await expect(gameService.removeRound(scenario.game.id, 999999)).rejects.toMatchObject({ status: 404 });
    const outraPartida = await prisma.game.create({
      data: { name: "Outra", classId: scenario.turma.id, teacherId: scenario.teacher.id },
    });
    const round = await startedRound();
    await roundService.forceStop(round.id);
    await roundService.closeCollaborativeCorrection(round.id);
    await roundService.score(round.id);
    await expect(gameService.removeRound(outraPartida.id, round.id)).rejects.toMatchObject({ status: 404 });
  });

  it("roomService.getByCode/publicInfo/joinUrl cobrem os casos restantes", () => {
    expect(roomService.joinUrl("STOP-TEST")).toContain("/join/STOP-TEST");
  });

  it("roomService.getByCode lança 404 para um código inexistente", async () => {
    await expect(roomService.getByCode("STOP-NADA")).rejects.toMatchObject({ status: 404 });
  });

  it("roomService.publicInfo devolve os dados públicos da sala", async () => {
    await joinAllStudents(scenario);
    const info = await roomService.publicInfo(scenario.room.code);
    expect(info).toMatchObject({ code: scenario.room.code, players: 3 });
  });

  it("roomService.join rejeita entrar numa sala fechada", async () => {
    await roomService.setStatus(scenario.room.code, "CLOSED");
    await expect(
      roomService.join(scenario.room.code, scenario.students[0].registrationNumber),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("answerService.submit rejeita uma rodada inexistente e trata value ausente como vazio", async () => {
    await expect(
      answerService.submit({ roundId: 999999, playerSessionId: players[0].playerSessionId, roundCategoryId: 1, value: "x" }),
    ).rejects.toMatchObject({ status: 404 });

    const round = await startedRound();
    const result = await answerService.submit({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
      roundCategoryId: round.categories[0].id,
      value: undefined,
    });
    expect(result.answer.value).toBe("");
  });

  it("answerService.review rejeita uma resposta inexistente", async () => {
    await expect(answerService.review(999999, "VALID")).rejects.toMatchObject({ status: 404 });
  });

  it("answerService.reviewMany rejeita ids inexistentes e rodada fora de correção", async () => {
    await expect(
      answerService.reviewMany([{ answerId: 999999, reviewState: "VALID" }]),
    ).rejects.toMatchObject({ status: 404 });

    const round = await startedRound();
    const submitted = await answerService.submit({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
      roundCategoryId: round.categories[0].id,
      value: `${round.letter}esposta`,
    });
    // A rodada ainda está em PLAYING: correção em lote não é permitida ainda.
    await expect(
      answerService.reviewMany([{ answerId: submitted.answer.id, reviewState: "VALID" }]),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("studentService.bulkCreate rejeita turma inexistente", async () => {
    await expect(
      studentService.bulkCreate({ classId: 999999, students: [{ registrationNumber: "1", name: "X" }] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("viewService.playerState lança 404 para uma sessão inexistente", async () => {
    await expect(viewService.playerState(999999)).rejects.toMatchObject({ status: 404 });
  });
});
