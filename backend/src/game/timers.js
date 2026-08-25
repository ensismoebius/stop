import logger from "../lib/logger.js";

/**
 * Cronometros autoritativos do servidor (spec 14 e 33).
 * O relogio do navegador e apenas representacao visual.
 */
const timers = new Map();

export function scheduleRoundEnd(roundId, delayMs, callback) {
  clearRoundTimer(roundId);
  const handle = setTimeout(() => {
    timers.delete(roundId);
    Promise.resolve()
      .then(callback)
      .catch((error) => logger.error(`Falha ao encerrar rodada ${roundId} por tempo`, error));
  }, Math.max(0, delayMs));
  if (typeof handle.unref === "function") handle.unref();
  timers.set(roundId, handle);
  return handle;
}

export function clearRoundTimer(roundId) {
  const handle = timers.get(roundId);
  if (handle) {
    clearTimeout(handle);
    timers.delete(roundId);
  }
}

export function hasRoundTimer(roundId) {
  return timers.has(roundId);
}

export function clearAllTimers() {
  for (const handle of timers.values()) clearTimeout(handle);
  timers.clear();
}

export default scheduleRoundEnd;
