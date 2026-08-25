import { normalizeAnswer } from "./normalize.js";

/**
 * Regra classica de pontuacao (spec 19).
 *
 *  10 -> resposta valida e exclusiva na categoria
 *   5 -> resposta valida, porem repetida por outro aluno
 *   0 -> vazia, invalida, marcada como invalida pelo professor,
 *        ou que nao comeca com a letra da rodada
 *
 * A validade semantica e sempre decisao do professor: aqui apenas
 * transformamos as marcacoes em pontos.
 */
export const POINTS = Object.freeze({ UNIQUE: 10, DUPLICATE: 5, NONE: 0 });

export const REVIEW_STATE = Object.freeze({
  PENDING: "PENDING",
  VALID: "VALID",
  INVALID: "INVALID",
  BLANK: "BLANK",
  DUPLICATE: "DUPLICATE",
});

/** Estados de correcao que contam como resposta aceita pelo professor. */
const ACCEPTED = new Set([REVIEW_STATE.VALID, REVIEW_STATE.DUPLICATE]);

/**
 * @typedef {object} ScoreableAnswer
 * @property {number|string} id
 * @property {number|string} playerSessionId
 * @property {number|string} roundCategoryId
 * @property {string} value
 * @property {string} [normalizedValue]
 * @property {string} reviewState
 */

/**
 * Calcula a pontuacao de todas as respostas de uma rodada.
 *
 * @param {ScoreableAnswer[]} answers
 * @returns {Map<number|string, { score: number, duplicated: boolean, reviewState: string }>}
 *   mapa indexado pelo id da resposta.
 */
export function scoreAnswers(answers) {
  const result = new Map();

  /** @type {Map<string, ScoreableAnswer[]>} */
  const buckets = new Map();

  for (const answer of answers) {
    const normalized = answer.normalizedValue ?? normalizeAnswer(answer.value);
    const accepted = ACCEPTED.has(answer.reviewState) && normalized.length > 0;
    if (!accepted) {
      result.set(answer.id, { score: POINTS.NONE, duplicated: false, reviewState: answer.reviewState });
      continue;
    }
    const key = `${answer.roundCategoryId}::${normalized}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(answer);
    else buckets.set(key, [answer]);
  }

  for (const bucket of buckets.values()) {
    // Duas respostas iguais do mesmo aluno nao existem: ha unique
    // (roundId, playerSessionId, roundCategoryId) no banco.
    const duplicated = bucket.length > 1;
    const score = duplicated ? POINTS.DUPLICATE : POINTS.UNIQUE;
    for (const answer of bucket) {
      result.set(answer.id, { score, duplicated, reviewState: answer.reviewState });
    }
  }

  return result;
}

/**
 * Soma a pontuacao por jogador a partir do resultado de `scoreAnswers`.
 * @param {ScoreableAnswer[]} answers
 * @returns {Map<number|string, number>}
 */
export function scoreByPlayer(answers) {
  const scored = scoreAnswers(answers);
  const totals = new Map();
  for (const answer of answers) {
    const entry = scored.get(answer.id);
    const current = totals.get(answer.playerSessionId) ?? 0;
    totals.set(answer.playerSessionId, current + (entry?.score ?? 0));
  }
  return totals;
}

/**
 * Sugere marcacoes automaticas para acelerar a correcao (spec 19).
 * Nunca substitui o professor: apenas pre-marca vazios e respostas que
 * nao comecam com a letra sorteada.
 *
 * @returns {"BLANK"|"INVALID"|"PENDING"}
 */
export function suggestReviewState(value, letter) {
  const normalized = normalizeAnswer(value);
  if (normalized.length === 0) return REVIEW_STATE.BLANK;
  const normalizedLetter = normalizeAnswer(letter);
  if (normalizedLetter && !normalized.startsWith(normalizedLetter)) {
    return REVIEW_STATE.INVALID;
  }
  return REVIEW_STATE.PENDING;
}

/**
 * Ranking com empates na mesma posicao (spec 42).
 * Nao usa ordem de chegada como criterio de desempate.
 *
 * @param {{ studentId: number, name: string, total: number }[]} entries
 */
export function buildRanking(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""), "pt-BR");
  });

  let position = 0;
  let previousTotal = null;
  let index = 0;

  return sorted.map((entry) => {
    index += 1;
    if (previousTotal === null || entry.total !== previousTotal) {
      position = index;
      previousTotal = entry.total;
    }
    return { ...entry, position };
  });
}

export default scoreAnswers;
