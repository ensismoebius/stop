import logger from "../lib/logger.js";

/**
 * Cronometros autoritativos do servidor (spec 14 e 33).
 * O relogio do navegador e apenas representacao visual.
 *
 * Chaveado por string livre (nao so por roundId) para suportar varios
 * temporizadores independentes na mesma rodada — ex.: fim do tempo de
 * resposta (`round:${id}`) e a janela de revelacao da letra
 * (`round:${id}:reveal`, spec 4/6 da correcao colaborativa).
 */
const timers = new Map();

export function scheduleTimer(key, delayMs, callback) {
  clearTimer(key);
  const handle = setTimeout(() => {
    timers.delete(key);
    Promise.resolve()
      .then(callback)
      .catch((error) => logger.error(`Falha ao executar temporizador ${key}`, error));
  }, Math.max(0, delayMs));
  if (typeof handle.unref === "function") handle.unref();
  timers.set(key, handle);
  return handle;
}

export function clearTimer(key) {
  const handle = timers.get(key);
  if (handle) {
    clearTimeout(handle);
    timers.delete(key);
  }
}

export function hasTimer(key) {
  return timers.has(key);
}

export function clearAllTimers() {
  for (const handle of timers.values()) clearTimeout(handle);
  timers.clear();
}

export const scheduleRoundEnd = (roundId, delayMs, callback) =>
  scheduleTimer(roundId, delayMs, callback);
export const clearRoundTimer = (roundId) => clearTimer(roundId);
export const hasRoundTimer = (roundId) => hasTimer(roundId);

export default scheduleRoundEnd;
