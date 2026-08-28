import { describe, expect, it } from "vitest";
import { assignReviews } from "../../src/game/reviewAssignment.js";

/** Participante mínimo para o algoritmo de distribuição: sessão + ids de respostas. */
function participant(playerSessionId, answerIds) {
  return { playerSessionId, answers: answerIds.map((id) => ({ id })) };
}

describe("distribuicao da correcao colaborativa (spec 9-14)", () => {
  it("nunca atribui a propria resposta ao proprio autor", () => {
    const participants = [
      participant("A", [1, 2]),
      participant("B", [3, 4]),
      participant("C", [5, 6]),
    ];
    const assignments = assignReviews(participants, 4);
    for (const [graderId, answerIds] of assignments) {
      const own = participants.find((p) => p.playerSessionId === graderId).answers.map((a) => a.id);
      for (const answerId of answerIds) {
        expect(own).not.toContain(answerId);
      }
    }
  });

  it("nunca repete o par avaliador+resposta", () => {
    const participants = Array.from({ length: 10 }, (_, i) =>
      participant(`p${i}`, [`p${i}-a`, `p${i}-b`]),
    );
    const assignments = assignReviews(participants, 5);
    for (const answerIds of assignments.values()) {
      expect(new Set(answerIds).size).toBe(answerIds.length);
    }
  });

  it("respeita a quantidade configurada quando ha respostas suficientes", () => {
    const participants = Array.from({ length: 6 }, (_, i) => participant(`p${i}`, [`p${i}-a`]));
    const assignments = assignReviews(participants, 3);
    for (const answerIds of assignments.values()) {
      // 5 respostas de outros alunos disponiveis, pedido 3: deve alcancar 3.
      expect(answerIds.length).toBe(3);
    }
  });

  it("distribui a carga de forma aproximadamente equilibrada", () => {
    const participants = Array.from({ length: 40 }, (_, i) => participant(`p${i}`, [`p${i}-a`]));
    const assignments = assignReviews(participants, 8);
    const load = new Map();
    for (const answerIds of assignments.values()) {
      for (const answerId of answerIds) load.set(answerId, (load.get(answerId) ?? 0) + 1);
    }
    const counts = [...load.values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
  });

  it("retorna atribuicoes vazias com um unico participante", () => {
    const assignments = assignReviews([participant("A", [1, 2])], 8);
    expect(assignments.get("A")).toEqual([]);
  });

  it("retorna atribuicoes vazias quando ninguem preencheu nada", () => {
    const assignments = assignReviews([participant("A", []), participant("B", [])], 8);
    expect(assignments.get("A")).toEqual([]);
    expect(assignments.get("B")).toEqual([]);
  });

  it("nao atribui nada quando count e zero", () => {
    const assignments = assignReviews([participant("A", [1]), participant("B", [2])], 0);
    expect(assignments.get("A")).toEqual([]);
    expect(assignments.get("B")).toEqual([]);
  });
});
