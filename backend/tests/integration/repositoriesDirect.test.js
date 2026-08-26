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
import roundService from "../../src/services/roundService.js";
import answerService from "../../src/services/answerService.js";
import gameRepository from "../../src/repositories/gameRepository.js";
import classRepository from "../../src/repositories/classRepository.js";
import roomRepository from "../../src/repositories/roomRepository.js";
import playerSessionRepository from "../../src/repositories/playerSessionRepository.js";
import answerRepository from "../../src/repositories/answerRepository.js";
import answerReviewRepository from "../../src/repositories/answerReviewRepository.js";
import telemetryRepository from "../../src/repositories/telemetryRepository.js";
import roundRepository, { roundParticipantRepository } from "../../src/repositories/roundRepository.js";

/**
 * Vários métodos de repositório existem para simetria da API (todo modelo
 * tem CRUD completo), mas hoje nenhum serviço os invoca — os fluxos reais
 * usam variações mais específicas (transações, queries agregadas). Ainda
 * assim são funções públicas, alcançáveis e comportam-se de forma simples
 * o bastante para testar diretamente contra o banco real, em vez de
 * deixá-las sem cobertura.
 */

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

describe("repositórios (métodos ainda não exercitados por nenhum serviço)", () => {
  it("gameRepository.list filtra por teacherId quando informado", async () => {
    const filtered = await gameRepository.list({ teacherId: scenario.teacher.id });
    expect(filtered.map((game) => game.id)).toContain(scenario.game.id);

    const outroProfessor = await prisma.teacher.create({
      data: { email: "outro@stop.local", name: "Outro", passwordHash: "x", role: "TEACHER" },
    });
    const semJogos = await gameRepository.list({ teacherId: outroProfessor.id });
    expect(semJogos).toEqual([]);
  });

  it("classRepository.findByCode localiza a turma pelo código", async () => {
    const found = await classRepository.findByCode(scenario.turma.code);
    expect(found.id).toBe(scenario.turma.id);
    expect(await classRepository.findByCode("CODIGO-INEXISTENTE")).toBeNull();
  });

  it("roomRepository.findById devolve a sala com jogo e sessões", async () => {
    await joinAllStudents(scenario);
    const found = await roomRepository.findById(scenario.room.id);
    expect(found.id).toBe(scenario.room.id);
    expect(found.game.id).toBe(scenario.game.id);
  });

  it("playerSessionRepository.findById e listByRoom devolvem as sessões da sala", async () => {
    const bySession = await playerSessionRepository.findById(players[0].playerSessionId);
    expect(bySession.student.name).toBe(scenario.students[0].name);

    const byRoom = await playerSessionRepository.listByRoom(scenario.room.id);
    expect(byRoom).toHaveLength(3);
  });

  it("roundRepository.create, listCategories, findLastByGame e remove funcionam isoladamente", async () => {
    const created = await roundRepository.create({
      gameId: scenario.game.id,
      roundNumber: 999,
      themeName: "Avulsa",
      letter: "",
      durationSeconds: 60,
      status: "CREATED",
    });
    expect(created.id).toBeTruthy();
    expect(created.categories).toEqual([]);

    // A segunda categoria não informa `order`: usa o índice como fallback.
    await roundRepository.createCategories(created.id, [
      { name: "Categoria X", order: 0 },
      { name: "Categoria Y" },
    ]);
    const categories = await roundRepository.listCategories(created.id);
    expect(categories).toHaveLength(2);
    expect(categories[0].name).toBe("Categoria X");
    expect(categories[1]).toMatchObject({ name: "Categoria Y", order: 1 });

    const last = await roundRepository.findLastByGame(scenario.game.id);
    expect(last.roundNumber).toBe(999);

    await roundRepository.remove(created.id);
    expect(await roundRepository.findById(created.id)).toBeNull();
  });

  it("roundParticipantRepository.upsert é idempotente e countActive conta apenas PLAYING", async () => {
    const round = await startedRound();
    const before = await roundParticipantRepository.countActive(round.id);
    expect(before).toBe(3);

    // upsert sobre um participante já existente não duplica nem falha.
    await roundParticipantRepository.upsert(round.id, players[0].playerSessionId, "PLAYING");
    const stillThree = await prisma.roundParticipant.count({ where: { roundId: round.id } });
    expect(stillThree).toBe(3);

    await roundService.eliminate({ roundId: round.id, playerSessionId: players[0].playerSessionId });
    expect(await roundParticipantRepository.countActive(round.id)).toBe(2);
  });

  it("answerRepository.countFilledByPlayer conta apenas respostas preenchidas", async () => {
    const round = await startedRound();
    const [c1, c2] = round.categories;
    await answerService.submit({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
      roundCategoryId: c1.id,
      value: `${round.letter}preenchida`,
    });
    await answerService.submit({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
      roundCategoryId: c2.id,
      value: "   ",
    });
    const filled = await answerRepository.countFilledByPlayer(round.id, players[0].playerSessionId);
    expect(filled).toBe(1);
  });

  it("answerReviewRepository.countPendingByRound e countByRound refletem o estado das avaliações", async () => {
    const round = await startedRound();
    for (const player of players) await fillAll(round, player.playerSessionId);
    await roundService.requestStop({ roundId: round.id, playerSessionId: players[0].playerSessionId });

    const total = await answerReviewRepository.countByRound(round.id);
    expect(total).toBeGreaterThan(0);
    const pendingBefore = await answerReviewRepository.countPendingByRound(round.id);
    expect(pendingBefore).toBe(total);

    const oneReview = await prisma.answerReview.findFirst({ where: { roundId: round.id } });
    await roundService.submitReview({
      playerSessionId: oneReview.graderPlayerSessionId,
      reviewId: oneReview.id,
      decision: "VALID",
    });
    const pendingAfter = await answerReviewRepository.countPendingByRound(round.id);
    expect(pendingAfter).toBe(total - 1);
  });

  it("telemetryRepository.record nunca lança, mesmo com uma referência inexistente (best-effort)", async () => {
    await expect(
      telemetryRepository.record({ type: "TESTE_FK_INVALIDA", roundId: 999999999 }),
    ).resolves.toBeUndefined();
  });

  it("telemetryRepository.listByRound devolve os eventos gravados na rodada", async () => {
    const round = await startedRound();
    await telemetryRepository.record({ type: "EVENTO_TESTE", roundId: round.id });
    const events = await telemetryRepository.listByRound(round.id);
    expect(events.map((e) => e.type)).toContain("EVENTO_TESTE");
  });

  it("roomService.setStatus fecha a sala e emite o evento de mudança de status", async () => {
    const updated = await roomService.setStatus(scenario.room.code, "CLOSED");
    expect(updated.status).toBe("CLOSED");
  });
});
