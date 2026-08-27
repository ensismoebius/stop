/**
 * Extrai as peças de rosto do "Adventurer" (DiceBear, CC BY 4.0, Lisa
 * Wischofsky) e escreve `src/data/faceParts.js`.
 *
 * Por que extrair em vez de gerar avatares prontos: o aluno monta o rosto
 * peça por peça, então precisamos das peças soltas — não de milhares de
 * combinações já renderizadas. E por que rodar isto na hora do build, e não
 * no navegador: a biblioteca inteira pesa megabytes; as peças pesam poucos KB.
 *
 * Cor: o cabelo e a pele são gerados com uma cor-sentinela e trocados em
 * tempo de execução pela cor escolhida. É o que permite 18 cores de cabelo
 * sem 18 cópias de cada corte.
 *
 * Uso: node scripts/extract-face-parts.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAvatar } from "@dicebear/core";
import { adventurer } from "@dicebear/collection";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(__dirname, "../src/data/faceParts.js");

/** Cores improváveis de aparecer no desenho, usadas como marcador. */
const SKIN_SENTINEL = "ff00ff";
const HAIR_SENTINEL = "00ff00";

const P = adventurer.schema.properties;
const VARIANTS = {
  hair: P.hair.items.enum.slice().sort(),
  eyes: P.eyes.items.enum.slice().sort(),
  eyebrows: P.eyebrows.items.enum.slice().sort(),
  mouth: P.mouth.items.enum.slice().sort(),
};

const BASE = {
  seed: "stop",
  skinColor: [SKIN_SENTINEL],
  hairColor: [HAIR_SENTINEL],
  glasses: [],
  glassesProbability: 0,
  earrings: [],
  earringsProbability: 0,
  features: [],
  featuresProbability: 0,
  size: 240,
};

const render = (options) => createAvatar(adventurer, { ...BASE, ...options }).toString();

const MASK_OPEN = '<g mask="url(#viewboxMask)">';

/** O miolo do SVG: tudo que está dentro do grupo da máscara. */
const bodyOf = (svg) => svg.slice(svg.indexOf(MASK_OPEN) + MASK_OPEN.length, svg.lastIndexOf("</g>"));

/**
 * Posições dos grupos <g> de primeiro nível dentro do miolo.
 *
 * Devolve os limites, não só o conteúdo: parte do desenho (a cabeça, por
 * exemplo) é um `<path>` solto ENTRE os grupos, e recompor a partir de uma
 * lista de grupos jogava esses pedaços fora — o rosto saía sem cabeça.
 */
function groupSpans(body) {
  const spans = [];
  let depth = 0;
  let from = 0;
  const re = /<g\b[^>]*>|<\/g>/g;
  let m;
  while ((m = re.exec(body))) {
    if (m[0] === "</g>") {
      depth -= 1;
      if (depth === 0) spans.push([from, m.index + 4]);
    } else {
      if (depth === 0) from = m.index;
      depth += 1;
    }
  }
  return spans;
}

/** Conteúdo dos grupos de primeiro nível (para comparar variantes). */
function topGroups(svg) {
  const body = bodyOf(svg);
  return groupSpans(body).map(([a, b]) => body.slice(a, b));
}

const REF = Object.fromEntries(Object.entries(VARIANTS).map(([k, v]) => [k, [v[0]]]));
const refGroups = topGroups(render(REF));

/** Qual grupo muda quando trocamos só esta peça. */
function slotOf(part) {
  const other = VARIANTS[part][Math.min(4, VARIANTS[part].length - 1)];
  const groups = topGroups(render({ ...REF, [part]: [other] }));
  for (let i = 0; i < Math.max(groups.length, refGroups.length); i += 1) {
    if (groups[i] !== refGroups[i]) return i;
  }
  return -1;
}

const slots = Object.fromEntries(Object.keys(VARIANTS).map((part) => [part, slotOf(part)]));
if (Object.values(slots).some((v) => v < 0) || new Set(Object.values(slots)).size !== 4) {
  throw new Error(`Não consegui isolar cada peça num grupo próprio: ${JSON.stringify(slots)}`);
}

/** Troca as cores-sentinela por marcadores que o runtime substitui. */
const markColors = (svg) =>
  svg
    .replaceAll(new RegExp(`#${SKIN_SENTINEL}`, "gi"), "{{skin}}")
    .replaceAll(new RegExp(`#${HAIR_SENTINEL}`, "gi"), "{{hair}}");

const pieces = {};
for (const [part, variants] of Object.entries(VARIANTS)) {
  pieces[part] = variants.map((variant) =>
    markColors(topGroups(render({ ...REF, [part]: [variant] }))[slots[part]]),
  );
}

// O esqueleto: tudo do desenho original, com buracos no lugar das peças
// trocáveis. Montado por recorte do miolo inteiro, para não perder o que
// está fora dos grupos (a cabeça é um `<path>` solto entre eles).
const shellSvg = render(REF);
const shellBody = bodyOf(shellSvg);
const slotByIndex = new Map(Object.entries(slots).map(([part, index]) => [index, part]));
const spans = groupSpans(shellBody);

let rebuilt = "";
let cursor = 0;
spans.forEach(([start, end], index) => {
  rebuilt += shellBody.slice(cursor, start);
  rebuilt += slotByIndex.has(index) ? `{{${slotByIndex.get(index)}}}` : shellBody.slice(start, end);
  cursor = end;
});
rebuilt += shellBody.slice(cursor);

const head = shellSvg.slice(0, shellSvg.indexOf(MASK_OPEN));
const shell = markColors(`${head}${MASK_OPEN}${rebuilt}</g></svg>`)
  // O tamanho quem decide é o CSS de quem usa.
  .replace(/ width="\d+" height="\d+"/, "");

const banner = `/**
 * Peças de rosto do estilo "Adventurer" (DiceBear), CC BY 4.0 — Lisa
 * Wischofsky. https://www.figma.com/community/file/1184595184137881796
 *
 * ARQUIVO GERADO por \`scripts/extract-face-parts.mjs\`. Não edite à mão:
 * rode o script de novo.
 *
 * \`{{skin}}\` e \`{{hair}}\` são trocados pela cor escolhida na hora de
 * desenhar — é por isso que 18 cores de cabelo não viram 18 cópias de cada
 * corte.
 */
`;

const body = `${banner}
export const FACE_SHELL = ${JSON.stringify(shell)};

export const FACE_PIECES = ${JSON.stringify(pieces)};

export const FACE_COUNTS = ${JSON.stringify(
  Object.fromEntries(Object.entries(pieces).map(([k, v]) => [k, v.length])),
)};
`;

fs.writeFileSync(outFile, body);

const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log("slots:", JSON.stringify(slots));
for (const [part, list] of Object.entries(pieces)) {
  console.log(`  ${part.padEnd(9)} ${String(list.length).padStart(3)} peças`);
}
console.log("módulo:", kb(body.length));
