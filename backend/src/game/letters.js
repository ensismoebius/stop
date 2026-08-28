import { randomInt } from "node:crypto";
import { normalizeLetter } from "./normalize.js";

/**
 * Conjunto padrao de letras. K, W, Y, Q, X e Z foram removidas por
 * produzirem poucas respostas no dominio de React Native (spec 15/16).
 */
export const DEFAULT_LETTER_POOL = "ABCDEFGHIJLMNOPRSTUV".split("");

/** Normaliza e deduplica o pool de letras; usa o padrao quando vazio/invalido. */
export function parseLetterPool(pool) {
  if (!pool) return [...DEFAULT_LETTER_POOL];
  const letters = (Array.isArray(pool) ? pool : String(pool).split(""))
    .map((letter) => normalizeLetter(letter))
    .filter((letter) => /^[A-Z]$/.test(letter));
  const unique = [...new Set(letters)];
  return unique.length > 0 ? unique : [...DEFAULT_LETTER_POOL];
}

/**
 * Sorteia uma letra evitando repeticoes enquanto houver letras disponiveis.
 * Quando o conjunto se esgota, o ciclo reinicia (spec 16).
 *
 * O sorteio usa `crypto.randomInt` no servidor: o cliente nunca e a
 * autoridade do sorteio (spec 15).
 *
 * @param {object} params
 * @param {string[]|string} [params.pool]
 * @param {string[]} [params.usedLetters]
 * @param {() => number} [params.random] injecao para testes deterministicos
 * @returns {{ letter: string, poolRestarted: boolean, remaining: string[] }}
 */
export function drawLetter({ pool, usedLetters = [], random } = {}) {
  const letters = parseLetterPool(pool);
  const used = new Set(usedLetters.map((letter) => normalizeLetter(letter)));

  let available = letters.filter((letter) => !used.has(letter));
  let poolRestarted = false;

  if (available.length === 0) {
    available = [...letters];
    poolRestarted = true;
  }

  const index = random
    ? Math.min(available.length - 1, Math.floor(random() * available.length))
    : randomInt(0, available.length);

  const letter = available[index];
  return {
    letter,
    poolRestarted,
    remaining: available.filter((item) => item !== letter),
  };
}

export default drawLetter;
