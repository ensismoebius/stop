import { describe, expect, it } from "vitest";
import { drawLetter, parseLetterPool, DEFAULT_LETTER_POOL } from "../../src/game/letters.js";

describe("sorteio de letras (spec 15 e 16)", () => {
  it("sorteia uma letra do conjunto", () => {
    const { letter } = drawLetter({ pool: "ABC" });
    expect(["A", "B", "C"]).toContain(letter);
  });

  it("nao repete letras enquanto houver disponiveis", () => {
    const used = [];
    for (let i = 0; i < 3; i += 1) {
      const { letter, poolRestarted } = drawLetter({ pool: "ABC", usedLetters: used });
      expect(used).not.toContain(letter);
      expect(poolRestarted).toBe(false);
      used.push(letter);
    }
    expect(new Set(used).size).toBe(3);
  });

  it("reinicia o conjunto quando todas as letras foram usadas", () => {
    const { letter, poolRestarted } = drawLetter({ pool: "ABC", usedLetters: ["A", "B", "C"] });
    expect(poolRestarted).toBe(true);
    expect(["A", "B", "C"]).toContain(letter);
  });

  it("aceita injecao de gerador para determinismo", () => {
    const { letter } = drawLetter({ pool: "ABC", random: () => 0 });
    expect(letter).toBe("A");
    const ultimo = drawLetter({ pool: "ABC", random: () => 0.999 });
    expect(ultimo.letter).toBe("C");
  });

  it("ignora entradas invalidas no conjunto", () => {
    expect(parseLetterPool("a1b!c")).toEqual(["A", "B", "C"]);
    expect(parseLetterPool("")).toEqual(DEFAULT_LETTER_POOL);
    expect(parseLetterPool("123")).toEqual(DEFAULT_LETTER_POOL);
  });

  it("ignora letras usadas fora do conjunto configurado", () => {
    const { letter } = drawLetter({ pool: "AB", usedLetters: ["Z", "A"] });
    expect(letter).toBe("B");
  });
});
