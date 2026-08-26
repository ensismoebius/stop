import { afterEach, describe, expect, it } from "vitest";
import { clearAllTimers, clearTimer, hasRoundTimer, hasTimer, scheduleTimer } from "../../src/game/timers.js";

afterEach(() => {
  clearAllTimers();
});

describe("game/timers (cronometros autoritativos, spec 14 e 33)", () => {
  it("hasTimer/hasRoundTimer refletem se a chave esta agendada", () => {
    expect(hasTimer("k1")).toBe(false);
    scheduleTimer("k1", 10_000, () => {});
    expect(hasTimer("k1")).toBe(true);
    expect(hasRoundTimer("k1")).toBe(true);
    clearTimer("k1");
    expect(hasTimer("k1")).toBe(false);
  });

  it("clearTimer em uma chave inexistente nao lanca", () => {
    expect(() => clearTimer("nunca-existiu")).not.toThrow();
  });
});
