import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  createScenario,
  prisma,
  resetDatabase,
  joinAllStudents,
  startedRound as startedRoundFixture,
} from "../helpers/fixtures.js";
import answerService from "../../src/services/answerService.js";
import roundService from "../../src/services/roundService.js";

let scenario;
let players;

const startedRound = () => startedRoundFixture(scenario);

beforeEach(async () => {
  await resetDatabase();
  scenario = await createScenario();
  players = await joinAllStudents(scenario);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("correção agregada por resposta distinta (spec 17/20/21/52)", () => {
  it("agrupa respostas iguais numa unica linha, ordenada por frequência", async () => {
    const round = await startedRound();
    const [c1] = round.categories;
    const letra = round.letter;

    // Joao e Maria respondem igual; Pedro difere.
    await answerService.submit({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
      roundCategoryId: c1.id,
      value: `${letra}efresh`,
    });
    await answerService.submit({
      roundId: round.id,
      playerSessionId: players[1].playerSessionId,
      roundCategoryId: c1.id,
      value: `${letra}EFRESH`,
    });
    await answerService.submit({
      roundId: round.id,
      playerSessionId: players[2].playerSessionId,
      roundCategoryId: c1.id,
      value: `${letra}outer`,
    });

    await roundService.forceStop(round.id);
    await roundService.closeCollaborativeCorrection(round.id);

    const grouped = await roundService.groupedCorrectionGrid(round.id);
    const category = grouped.categories.find((cat) => cat.id === c1.id);
    expect(category.groups).toHaveLength(2);
    expect(category.groups[0].count).toBe(2);
    expect(category.groups[1].count).toBe(1);

    const majority = category.groups[0];
    expect(majority.answerIds).toHaveLength(2);

    // O professor corrige o grupo uma vez, propagando via reviewMany.
    await answerService.reviewMany(majority.answerIds.map((id) => ({ answerId: id, reviewState: "VALID" })));

    const updated = await prisma.answer.findMany({ where: { id: { in: majority.answerIds } } });
    expect(updated.every((answer) => answer.reviewState === "VALID")).toBe(true);
  });

  it("exclui respostas de alunos eliminados do agrupamento", async () => {
    const round = await startedRound();
    const [c1] = round.categories;
    await answerService.submit({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
      roundCategoryId: c1.id,
      value: `${round.letter}esposta`,
    });
    await roundService.eliminate({ roundId: round.id, playerSessionId: players[0].playerSessionId });

    const grouped = await roundService.groupedCorrectionGrid(round.id);
    const category = grouped.categories.find((cat) => cat.id === c1.id);
    expect(category.groups).toHaveLength(0);
  });
});
