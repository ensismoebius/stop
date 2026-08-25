/**
 * Normalizacao de respostas (spec 20 e 57).
 *
 * A normalizacao existe apenas para comparacao. O texto original digitado
 * pelo aluno permanece armazenado em `Answer.value`.
 */

const DIACRITICS = /\p{Diacritic}/gu;
const WHITESPACE = /\s+/gu;

/**
 * @param {unknown} value
 * @returns {string} valor normalizado: minusculo, sem acentos, sem espacos
 *   redundantes e Unicode-aware (NFD -> remove diacriticos -> NFC).
 */
export function normalizeAnswer(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .normalize("NFC")
    .toLocaleLowerCase("pt-BR")
    .replace(WHITESPACE, " ")
    .trim();
}

/**
 * Normaliza uma letra sorteada para comparacao (maiuscula, sem acento).
 */
export function normalizeLetter(letter) {
  if (!letter) return "";
  return String(letter)
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .normalize("NFC")
    .toLocaleUpperCase("pt-BR")
    .trim();
}

/**
 * Verifica se a resposta comeca com a letra da rodada (spec 21).
 * Criterio puramente lexical: nao decide correcao semantica.
 */
export function startsWithLetter(value, letter) {
  const normalizedValue = normalizeAnswer(value);
  const normalizedLetter = normalizeAnswer(letter);
  if (!normalizedValue || !normalizedLetter) return false;
  return normalizedValue.startsWith(normalizedLetter);
}

/**
 * Uma resposta "preenchida" e aquela cuja normalizacao nao e vazia.
 * Evita que apenas espacos habilitem o botao STOP (spec 11).
 */
export function isFilled(value) {
  return normalizeAnswer(value).length > 0;
}

export default normalizeAnswer;
