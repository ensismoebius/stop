import { describe, expect, it } from "vitest";
import {
  POINTS,
  scoreAnswers,
  scoreByPlayer,
  suggestReviewState,
} from "../../src/game/scoring.js";

const answer = (id, playerSessionId, value, reviewState = "VALID", roundCategoryId = 1) => ({
  id,
  playerSessionId,
  roundCategoryId,
  value,
  normalizedValue: value.trim().toLowerCase(),
  reviewState,
});

describe("pontuacao 10/5/0 (spec 19)", () => {
  it("aplica o exemplo da especificacao", () => {
    // Letra R, categoria Componente: Joao/Maria = Refresh, Pedro = Router.
    const answers = [
      answer(1, 10, "Refresh"),
      answer(2, 20, "Refresh"),
      answer(3, 30, "Router"),
    ];
    const scored = scoreAnswers(answers);
    expect(scored.get(1).score).toBe(POINTS.DUPLICATE);
    expect(scored.get(2).score).toBe(POINTS.DUPLICATE);
    expect(scored.get(3).score).toBe(POINTS.UNIQUE);
  });

  it("compara respostas normalizadas", () => {
    const answers = [answer(1, 10, "UseState"), answer(2, 20, "  usestate ")];
    const scored = scoreAnswers(answers);
    expect(scored.get(1).score).toBe(5);
    expect(scored.get(2).score).toBe(5);
  });

  it("da zero para vazio, invalido e em branco", () => {
    const answers = [
      answer(1, 10, "", "BLANK"),
      answer(2, 20, "Expo", "INVALID"),
      answer(3, 30, "   ", "VALID"),
    ];
    const scored = scoreAnswers(answers);
    expect(scored.get(1).score).toBe(0);
    expect(scored.get(2).score).toBe(0);
    expect(scored.get(3).score).toBe(0);
  });

  it("nao considera pendentes como aceitas", () => {
    const scored = scoreAnswers([answer(1, 10, "React", "PENDING")]);
    expect(scored.get(1).score).toBe(0);
  });

  it("respostas iguais em categorias diferentes nao sao duplicadas", () => {
    const answers = [answer(1, 10, "React", "VALID", 1), answer(2, 20, "React", "VALID", 2)];
    const scored = scoreAnswers(answers);
    expect(scored.get(1).score).toBe(10);
    expect(scored.get(2).score).toBe(10);
  });

  it("soma a pontuacao por jogador", () => {
    const answers = [
      answer(1, 10, "React", "VALID", 1),
      answer(2, 10, "Router", "VALID", 2),
      answer(3, 20, "React", "VALID", 1),
    ];
    const totals = scoreByPlayer(answers);
    expect(totals.get(10)).toBe(5 + 10);
    expect(totals.get(20)).toBe(5);
  });
});

describe("sugestao automatica de correcao (spec 19 e 21)", () => {
  it("marca vazio como EM BRANCO", () => {
    expect(suggestReviewState("   ", "R")).toBe("BLANK");
  });

  it("marca como invalida a resposta que nao comeca com a letra", () => {
    expect(suggestReviewState("Expo", "R")).toBe("INVALID");
  });

  it("deixa pendente a decisao semantica", () => {
    expect(suggestReviewState("React", "R")).toBe("PENDING");
  });
});
