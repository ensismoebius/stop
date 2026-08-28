/**
 * Avatar montado pelo próprio aluno (spec 6).
 *
 * As peças são as do estilo "Adventurer" (DiceBear, CC BY 4.0 — Lisa
 * Wischofsky), extraídas em tempo de build por
 * `scripts/extract-face-parts.mjs`. Aqui ficam só a receita (quais peças e
 * quais cores) e como transformá-la num desenho.
 *
 * O que vai para o banco é a receita codificada (`face:v1:…`), nunca
 * marcação: nada de SVG de origem desconhecida entra pelo `avatarUrl`.
 */
import { FACE_COUNTS, FACE_PIECES, FACE_SHELL } from "../data/faceParts.js";

export const FACE_PREFIX = "face:v1:";

export const SKIN_TONES = [
  "#f2d3b1", "#eec1a2", "#ecad80", "#d99b6c", "#c68642", "#b07341",
  "#9e5622", "#8a4a1e", "#763900", "#5f2f06", "#4b2508", "#3a1c05",
];

export const HAIR_COLORS = [
  "#0e0e0e", "#2c1b18", "#3a2a1d", "#562306", "#6a4e35", "#796a45",
  "#8d5524", "#a55728", "#ac6511", "#b9a05f", "#cb6820", "#d6b370",
  "#e5d7a3", "#f2e2b6", "#afafaf", "#e8e1e1", "#ab2a18", "#c93305",
  "#3eac2c", "#2f7fd1", "#dba3be", "#592454",
];

/**
 * As etapas do montador, na ordem em que o aluno as percorre. Cada uma
 * mexe em uma coisa só — é o que diferencia um assistente de um painel
 * cheio de controles ao mesmo tempo.
 */
export const FACE_STEPS = [
  {
    key: "sk",
    title: "Tom de pele",
    hint: "Escolha o tom que mais parece com você.",
    kind: "palette",
    palette: SKIN_TONES,
  },
  {
    key: "hair",
    title: "Cabelo",
    hint: "São 45 cortes — passe por eles e pare no seu.",
    kind: "gallery",
    count: FACE_COUNTS.hair,
  },
  {
    key: "hc",
    title: "Cor do cabelo",
    hint: "Do preto ao azul: vale a sua cor ou a que você quiser.",
    kind: "palette",
    palette: HAIR_COLORS,
  },
  {
    key: "eyes",
    title: "Olhos",
    hint: "O olhar muda tudo. Vá até achar o seu.",
    kind: "gallery",
    count: FACE_COUNTS.eyes,
  },
  {
    key: "eyebrows",
    title: "Sobrancelhas",
    hint: "É a sobrancelha que deixa a cara brava, surpresa ou tranquila.",
    kind: "gallery",
    count: FACE_COUNTS.eyebrows,
  },
  {
    key: "mouth",
    title: "Boca",
    hint: "Sorriso, bico, língua de fora — a escolha é sua.",
    kind: "gallery",
    count: FACE_COUNTS.mouth,
  },
];

const LIMITS = {
  sk: SKIN_TONES.length,
  hc: HAIR_COLORS.length,
  hair: FACE_COUNTS.hair,
  eyes: FACE_COUNTS.eyes,
  eyebrows: FACE_COUNTS.eyebrows,
  mouth: FACE_COUNTS.mouth,
};

/** Ordem estável — o código é posicional. */
const ORDER = ["sk", "hc", "hair", "eyes", "eyebrows", "mouth"];

export const DEFAULT_FACE = { sk: 2, hc: 1, hair: 0, eyes: 0, eyebrows: 0, mouth: 0 };

/** Mantém cada campo dentro do seu intervalo — entrada estranha não quebra o desenho. */
export function normalizeFace(spec) {
  const out = {};
  for (const key of ORDER) {
    const raw = Number(spec?.[key]);
    const value = Number.isFinite(raw) ? Math.round(raw) : DEFAULT_FACE[key];
    out[key] = Math.min(LIMITS[key] - 1, Math.max(0, value));
  }
  return out;
}

/**
 * Codifica em base36, dois caracteres por campo: há listas com mais de 36
 * peças (45 cortes de cabelo), então um caractere só não daria conta.
 */
const pad = (n) => n.toString(36).padStart(2, "0");

/** Codifica o rosto normalizado em uma string compacta base36. */
export function encodeFace(spec) {
  const safe = normalizeFace(spec);
  return FACE_PREFIX + ORDER.map((key) => pad(safe[key])).join("");
}

/** Decodifica a string compacta de volta em um rosto normalizado. */
export function decodeFace(value) {
  if (typeof value !== "string" || !value.startsWith(FACE_PREFIX)) return null;
  const code = value.slice(FACE_PREFIX.length);
  if (code.length !== ORDER.length * 2 || !/^[0-9a-z]+$/.test(code)) return null;
  const spec = {};
  ORDER.forEach((key, index) => {
    spec[key] = parseInt(code.slice(index * 2, index * 2 + 2), 36);
  });
  return normalizeFace(spec);
}

export const isFaceSpec = (value) => decodeFace(value) !== null;

/** Gera um rosto aleatorio dentro dos limites de cada parte. */
export function randomFace() {
  const spec = {};
  for (const key of ORDER) spec[key] = Math.floor(Math.random() * LIMITS[key]);
  return normalizeFace(spec);
}

/**
 * Monta o SVG do rosto. Devolve marcação pronta para `dangerouslySetInnerHTML`
 * — e ela é segura porque nada aqui vem do usuário: as peças são as do
 * arquivo gerado e as cores saem das paletas acima, escolhidas por índice.
 */
export function faceSvg(spec) {
  const f = normalizeFace(spec);
  return FACE_SHELL.replace("{{hair}}", FACE_PIECES.hair[f.hair])
    .replace("{{eyes}}", FACE_PIECES.eyes[f.eyes])
    .replace("{{eyebrows}}", FACE_PIECES.eyebrows[f.eyebrows])
    .replace("{{mouth}}", FACE_PIECES.mouth[f.mouth])
    .replaceAll("{{skin}}", SKIN_TONES[f.sk])
    .replaceAll("{{hair}}", HAIR_COLORS[f.hc]);
}
