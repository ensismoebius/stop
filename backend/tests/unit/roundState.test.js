import { describe, expect, it } from "vitest";
import {
  ROUND_STATUS,
  acceptsAnswers,
  assertTransition,
  canTransition,
  isClosed,
  isEligible,
  nextStates,
} from "../../src/game/roundState.js";

describe("maquina de estados da rodada (spec 32)", () => {
  it("permite o caminho feliz completo", () => {
    const caminho = [
      ROUND_STATUS.CREATED,
      ROUND_STATUS.READY,
      ROUND_STATUS.STARTING,
      ROUND_STATUS.PLAYING,
      ROUND_STATUS.STOPPED,
      ROUND_STATUS.CORRECTION,
      ROUND_STATUS.SCORED,
      ROUND_STATUS.FINISHED,
    ];
    for (let i = 0; i < caminho.length - 1; i += 1) {
      expect(canTransition(caminho[i], caminho[i + 1])).toBe(true);
    }
  });

  it("impede FINISHED -> PLAYING", () => {
    expect(canTransition(ROUND_STATUS.FINISHED, ROUND_STATUS.PLAYING)).toBe(false);
    expect(() => assertTransition(ROUND_STATUS.FINISHED, ROUND_STATUS.PLAYING)).toThrow(
      /Transição de rodada inválida/,
    );
  });

  it("impede saltos arbitrarios", () => {
    expect(canTransition(ROUND_STATUS.CREATED, ROUND_STATUS.PLAYING)).toBe(false);
    expect(canTransition(ROUND_STATUS.PLAYING, ROUND_STATUS.SCORED)).toBe(false);
    expect(canTransition(ROUND_STATUS.STOPPED, ROUND_STATUS.PLAYING)).toBe(false);
  });

  it("FINISHED e estado terminal", () => {
    expect(nextStates(ROUND_STATUS.FINISHED)).toEqual([]);
  });

  it("aceita respostas apenas em PLAYING (spec 47)", () => {
    expect(acceptsAnswers(ROUND_STATUS.PLAYING)).toBe(true);
    for (const status of [
      ROUND_STATUS.CREATED,
      ROUND_STATUS.READY,
      ROUND_STATUS.STOPPED,
      ROUND_STATUS.CORRECTION,
      ROUND_STATUS.SCORED,
      ROUND_STATUS.FINISHED,
    ]) {
      expect(acceptsAnswers(status)).toBe(false);
    }
  });

  it("reconhece rodadas encerradas", () => {
    expect(isClosed(ROUND_STATUS.STOPPED)).toBe(true);
    expect(isClosed(ROUND_STATUS.PLAYING)).toBe(false);
  });

  it("somente jogador PLAYING e elegivel", () => {
    expect(isEligible("PLAYING")).toBe(true);
    expect(isEligible("ELIMINATED")).toBe(false);
    expect(isEligible("SUBMITTED")).toBe(false);
  });
});
