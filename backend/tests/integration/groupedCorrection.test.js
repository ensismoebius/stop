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

/**
 * Primeira letra garantidamente DIFERENTE da sorteada — a letra da rodada é
 * aleatória, então qualquer prefixo fixo colide com ela mais cedo ou mais
 * tarde e transforma "não começa com a letra" em "começa", justamente o que
 * estes testes querem negar.
 */
const prefixoDiferenteDe = (letra) => (String(letra).toUpperCase() === "A" ? "B" : "A");

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

  it("por padrao (STARTS_WITH), so marca matchesLetter para respostas que comecam com a letra", async () => {
    const round = await startedRound();
    const [c1] = round.categories;
    const letra = round.letter;

    await answerService.submit({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
      roundCategoryId: c1.id,
      // Contem a letra sorteada mas NAO comeca com ela — e a primeira letra
      // precisa ser escolhida em funcao do sorteio, nao fixada: com o literal
      // `Servi${letra}o`, sortear "S" produzia "ServiSo", que comeca com a
      // letra e derrubava o teste em ~1 de cada 20 execucoes (o pool tem 20
      // letras). Falha intermitente classica desta suite — o mesmo formato do
      // "zzz-fora-da-letra" descrito em testes.md.
      value: `${prefixoDiferenteDe(letra)}servi${letra}o`,
    });

    const grouped = await roundService.groupedCorrectionGrid(round.id);
    const category = grouped.categories.find((cat) => cat.id === c1.id);
    expect(category.groups[0].matchesLetter).toBe(false);
  });

  it("com a rodada configurada para CONTAINS, marca matchesLetter para respostas que apenas contem a letra", async () => {
    const round = await startedRoundFixture(scenario, { letterRule: "CONTAINS" });
    expect(round.letterRule).toBe("CONTAINS");
    const [c1] = round.categories;
    const letra = round.letter;

    await answerService.submit({
      roundId: round.id,
      playerSessionId: players[0].playerSessionId,
      roundCategoryId: c1.id,
      // Mesma construcao do teste acima: garantidamente contem a letra sem
      // comecar com ela, seja qual for o sorteio.
      value: `${prefixoDiferenteDe(letra)}servi${letra}o`,
    });

    const grouped = await roundService.groupedCorrectionGrid(round.id);
    expect(grouped.round.letterRule).toBe("CONTAINS");
    const category = grouped.categories.find((cat) => cat.id === c1.id);
    expect(category.groups[0].matchesLetter).toBe(true);

    // a correcao automatica tambem respeita a regra: nao marca INVALID so
    // por nao comecar com a letra quando a regra da rodada e CONTAINS.
    await roundService.forceStop(round.id);
    await roundService.closeCollaborativeCorrection(round.id);
    const answer = await prisma.answer.findFirst({ where: { roundId: round.id, roundCategoryId: c1.id } });
    expect(answer.reviewState).not.toBe("INVALID");
  });
});
