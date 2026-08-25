/**
 * Maquina de estados explicita da rodada (spec 32).
 * Transicoes arbitrarias sao proibidas: FINISHED -> PLAYING e impossivel.
 */
export const ROUND_STATUS = Object.freeze({
  CREATED: "CREATED",
  READY: "READY",
  STARTING: "STARTING",
  PLAYING: "PLAYING",
  STOPPED: "STOPPED",
  COLLABORATIVE_CORRECTION: "COLLABORATIVE_CORRECTION",
  CORRECTION: "CORRECTION",
  SCORED: "SCORED",
  FINISHED: "FINISHED",
});

const TRANSITIONS = Object.freeze({
  CREATED: ["READY", "FINISHED"],
  READY: ["STARTING", "CREATED", "FINISHED"],
  STARTING: ["PLAYING", "FINISHED"],
  PLAYING: ["STOPPED", "FINISHED"],
  STOPPED: ["COLLABORATIVE_CORRECTION", "FINISHED"],
  COLLABORATIVE_CORRECTION: ["CORRECTION", "FINISHED"],
  CORRECTION: ["SCORED", "FINISHED"],
  SCORED: ["FINISHED"],
  FINISHED: [],
});

export function canTransition(from, to) {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const error = new Error(`Transição de rodada inválida: ${from} -> ${to}`);
    error.code = "INVALID_ROUND_TRANSITION";
    error.status = 409;
    throw error;
  }
  return true;
}

export function nextStates(from) {
  return [...(TRANSITIONS[from] ?? [])];
}

/** A rodada aceita edicao de respostas somente em PLAYING (spec 47). */
export function acceptsAnswers(status) {
  return status === ROUND_STATUS.PLAYING;
}

/** A rodada já foi encerrada para os alunos. */
export function isClosed(status) {
  return [
    ROUND_STATUS.STOPPED,
    ROUND_STATUS.COLLABORATIVE_CORRECTION,
    ROUND_STATUS.CORRECTION,
    ROUND_STATUS.SCORED,
    ROUND_STATUS.FINISHED,
  ].includes(status);
}

// Status do jogador (PLAYER_STATUS/isEligible) mora em ./playerState.js —
// e outra maquina de estados, independente da rodada.

export default ROUND_STATUS;
