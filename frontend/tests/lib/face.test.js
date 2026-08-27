import { describe, expect, it } from "vitest";
import {
  DEFAULT_FACE,
  FACE_PREFIX,
  FACE_STEPS,
  HAIR_COLORS,
  SKIN_TONES,
  decodeFace,
  encodeFace,
  faceSvg,
  isFaceSpec,
  normalizeFace,
  randomFace,
} from "../../src/lib/face.js";
import { FACE_COUNTS } from "../../src/data/faceParts.js";

/** O mesmo regex que o backend usa para aceitar o campo. */
const BACKEND_RE =
  /^(face:v1:[0-9a-z]{1,40}|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*)$/;

describe("receita do rosto", () => {
  it("codifica e decodifica sem perder nada", () => {
    const code = encodeFace(DEFAULT_FACE);
    expect(code.startsWith(FACE_PREFIX)).toBe(true);
    expect(decodeFace(code)).toEqual(normalizeFace(DEFAULT_FACE));
  });

  it("passa na validação do backend", () => {
    expect(BACKEND_RE.test(encodeFace(DEFAULT_FACE))).toBe(true);
    expect(BACKEND_RE.test(encodeFace(randomFace()))).toBe(true);
  });

  it("aguenta índices de dois dígitos", () => {
    // Há 45 cortes de cabelo: um caractere base36 (máx. 35) não bastaria.
    const alto = { ...DEFAULT_FACE, hair: FACE_COUNTS.hair - 1, mouth: FACE_COUNTS.mouth - 1 };
    expect(decodeFace(encodeFace(alto))).toEqual(normalizeFace(alto));
    expect(FACE_COUNTS.hair).toBeGreaterThan(36);
  });

  it("sobrevive a mil rostos sorteados", () => {
    for (let i = 0; i < 1000; i += 1) {
      const face = randomFace();
      expect(decodeFace(encodeFace(face))).toEqual(face);
      expect(BACKEND_RE.test(encodeFace(face))).toBe(true);
    }
  });

  it("recusa qualquer coisa que não seja uma receita", () => {
    expect(decodeFace(null)).toBeNull();
    expect(decodeFace("")).toBeNull();
    expect(decodeFace("/avatars/avatar-01.svg")).toBeNull();
    expect(decodeFace("data:image/jpeg;base64,abc")).toBeNull();
    expect(decodeFace("face:v1:")).toBeNull();
    expect(decodeFace("face:v1:ABCDEF")).toBeNull(); // maiúsculas não entram
    expect(decodeFace(`${FACE_PREFIX}0`)).toBeNull(); // tamanho errado
  });

  it("apara valores fora do intervalo em vez de desenhar lixo", () => {
    const safe = normalizeFace({ sk: 999, hair: -40, mouth: "x" });
    expect(safe.sk).toBe(SKIN_TONES.length - 1);
    expect(safe.hair).toBe(0);
    expect(safe.mouth).toBe(DEFAULT_FACE.mouth);
  });

  it("isFaceSpec separa receita de foto", () => {
    expect(isFaceSpec(encodeFace(DEFAULT_FACE))).toBe(true);
    expect(isFaceSpec("data:image/jpeg;base64,abc")).toBe(false);
  });

  it("as etapas do assistente cobrem todas as partes do rosto", () => {
    expect(FACE_STEPS.map((s) => s.key)).toEqual([
      "sk",
      "hair",
      "hc",
      "eyes",
      "eyebrows",
      "mouth",
    ]);
    for (const step of FACE_STEPS) {
      expect(step.title).toBeTruthy();
      if (step.kind === "palette") expect(step.palette.length).toBeGreaterThan(0);
      else expect(step.count).toBeGreaterThan(0);
    }
  });
});

describe("desenho do rosto", () => {
  it("monta um SVG sem sobrar marcador de peça nem de cor", () => {
    const svg = faceSvg(DEFAULT_FACE);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toMatch(/\{\{\w+\}\}/);
  });

  it("aplica as cores escolhidas", () => {
    const svg = faceSvg({ ...DEFAULT_FACE, sk: 0, hc: HAIR_COLORS.indexOf("#c93305") });
    expect(svg).toContain(SKIN_TONES[0]);
    expect(svg).toContain("#c93305");
  });

  it("desenha todas as peças de todas as partes sem quebrar", () => {
    for (const [part, count] of Object.entries(FACE_COUNTS)) {
      for (let i = 0; i < count; i += 1) {
        const svg = faceSvg({ ...DEFAULT_FACE, [part]: i });
        expect(svg.startsWith("<svg")).toBe(true);
        expect(svg).not.toMatch(/\{\{\w+\}\}/);
      }
    }
  });

  it("trocar de peça muda o desenho de verdade", () => {
    expect(faceSvg({ ...DEFAULT_FACE, mouth: 0 })).not.toBe(faceSvg({ ...DEFAULT_FACE, mouth: 7 }));
    expect(faceSvg({ ...DEFAULT_FACE, hair: 0 })).not.toBe(faceSvg({ ...DEFAULT_FACE, hair: 20 }));
    expect(faceSvg({ ...DEFAULT_FACE, sk: 0 })).not.toBe(faceSvg({ ...DEFAULT_FACE, sk: 9 }));
  });
});
