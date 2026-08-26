import { describe, expect, it } from "vitest";
import { normalizeAnswer, normalizeLetter, startsWithLetter, matchesLetter, isFilled } from "../../src/game/normalize.js";

describe("normalizeAnswer (spec 20 e 57)", () => {
  it("e case-insensitive", () => {
    expect(normalizeAnswer("UseState")).toBe("usestate");
    expect(normalizeAnswer("usestate")).toBe("usestate");
    expect(normalizeAnswer("USESTATE")).toBe("usestate");
  });

  it("remove espacos nas bordas e colapsa espacos internos", () => {
    expect(normalizeAnswer("  useState  ")).toBe("usestate");
    expect(normalizeAnswer("React   Native")).toBe("react native");
    expect(normalizeAnswer("\tSafe\nArea\t")).toBe("safe area");
  });

  it("e tolerante a acentos do portugues", () => {
    expect(normalizeAnswer("Navegação")).toBe("navegacao");
    expect(normalizeAnswer("navegacao")).toBe("navegacao");
    expect(normalizeAnswer("Método")).toBe("metodo");
    expect(normalizeAnswer("ÁÉÍÓÚÂÊÔÃÕÇ")).toBe("aeiouaeoaoc");
  });

  it("trata formas Unicode compostas e decompostas como iguais", () => {
    const composta = "ação";
    const decomposta = "ação";
    expect(normalizeAnswer(composta)).toBe(normalizeAnswer(decomposta));
  });

  it("aceita valores vazios e nulos", () => {
    expect(normalizeAnswer("")).toBe("");
    expect(normalizeAnswer(null)).toBe("");
    expect(normalizeAnswer(undefined)).toBe("");
    expect(normalizeAnswer("   ")).toBe("");
  });
});

describe("startsWithLetter (spec 21)", () => {
  it("aceita a resposta que comeca com a letra", () => {
    expect(startsWithLetter("React", "R")).toBe(true);
    expect(startsWithLetter("  refresh ", "R")).toBe(true);
  });

  it("rejeita a resposta que nao comeca com a letra", () => {
    expect(startsWithLetter("Expo", "R")).toBe(false);
  });

  it("ignora acentos na comparacao", () => {
    expect(startsWithLetter("Ícone", "I")).toBe(true);
  });

  it("rejeita resposta vazia", () => {
    expect(startsWithLetter("   ", "R")).toBe(false);
  });
});

describe("matchesLetter (spec 21 — regra escolhida pelo professor)", () => {
  it("no modo padrao (sem regra informada), comporta-se como startsWithLetter", () => {
    expect(matchesLetter("React", "R")).toBe(true);
    expect(matchesLetter("Expo", "R")).toBe(false);
  });

  it("STARTS_WITH explicito aceita so quando a resposta comeca com a letra", () => {
    expect(matchesLetter("React", "R", "STARTS_WITH")).toBe(true);
    expect(matchesLetter("Expo", "R", "STARTS_WITH")).toBe(false);
  });

  it("CONTAINS aceita a letra em qualquer posicao da resposta", () => {
    expect(matchesLetter("Expo", "R", "CONTAINS")).toBe(false);
    expect(matchesLetter("Servidor", "R", "CONTAINS")).toBe(true);
    expect(matchesLetter("React", "R", "CONTAINS")).toBe(true);
  });

  it("CONTAINS ignora acentos, igual STARTS_WITH", () => {
    expect(matchesLetter("Bola", "I", "CONTAINS")).toBe(false);
    expect(matchesLetter("Ícone", "I", "CONTAINS")).toBe(true);
  });

  it("rejeita resposta ou letra vazia em qualquer modo", () => {
    expect(matchesLetter("   ", "R", "CONTAINS")).toBe(false);
    expect(matchesLetter("React", "", "CONTAINS")).toBe(false);
  });
});

describe("isFilled", () => {
  it("nao considera espacos como preenchimento", () => {
    expect(isFilled("   ")).toBe(false);
    expect(isFilled("a")).toBe(true);
  });
});

describe("normalizeLetter", () => {
  it("normaliza para maiuscula sem acento", () => {
    expect(normalizeLetter("á")).toBe("A");
    expect(normalizeLetter(" r ")).toBe("R");
  });

  it("devolve vazio para valores nulos/vazios", () => {
    expect(normalizeLetter(null)).toBe("");
    expect(normalizeLetter(undefined)).toBe("");
    expect(normalizeLetter("")).toBe("");
  });
});
