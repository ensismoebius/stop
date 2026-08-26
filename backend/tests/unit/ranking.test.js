import { describe, expect, it } from "vitest";
import { buildRanking } from "../../src/game/ranking.js";

describe("ranking (spec 42)", () => {
  it("ordena por pontuacao decrescente", () => {
    const ranking = buildRanking([
      { studentId: 1, name: "Joao", total: 120 },
      { studentId: 2, name: "Maria", total: 115 },
      { studentId: 3, name: "Pedro", total: 103 },
    ]);
    expect(ranking.map((entry) => entry.position)).toEqual([1, 2, 3]);
  });

  it("empates ocupam a mesma posicao", () => {
    const ranking = buildRanking([
      { studentId: 1, name: "Joao", total: 100 },
      { studentId: 2, name: "Maria", total: 100 },
      { studentId: 3, name: "Pedro", total: 50 },
    ]);
    expect(ranking[0].position).toBe(1);
    expect(ranking[1].position).toBe(1);
    // Posicao seguinte pula, sem usar ordem de chegada como desempate.
    expect(ranking[2].position).toBe(3);
  });

  it("usa string vazia no desempate quando o nome esta ausente", () => {
    const ranking = buildRanking([
      { studentId: 1, name: undefined, total: 10 },
      { studentId: 2, name: "Ana", total: 10 },
    ]);
    // "" vem antes de "Ana" no localeCompare pt-BR.
    expect(ranking[0].studentId).toBe(1);
    expect(ranking[1].studentId).toBe(2);
  });

  it("usa string vazia dos dois lados quando nenhum dos empatados tem nome", () => {
    const ranking = buildRanking([
      { studentId: 1, name: undefined, total: 10 },
      { studentId: 2, name: undefined, total: 10 },
      { studentId: 3, name: undefined, total: 10 },
    ]);
    expect(ranking.every((entry) => entry.position === 1)).toBe(true);
  });
});
