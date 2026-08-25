/**
 * Estado do jogador dentro da sala/rodada (spec 7) — separado da maquina
 * de estados da rodada (game/roundState.js): sao duas dimensoes
 * independentes (o status da rodada e compartilhado por todos; o status
 * do jogador e por PlayerSession/RoundParticipant).
 */
export const PLAYER_STATUS = Object.freeze({
  WAITING: "WAITING",
  READY: "READY",
  PLAYING: "PLAYING",
  SUBMITTED: "SUBMITTED",
  ELIMINATED: "ELIMINATED",
  FINISHED: "FINISHED",
});

/** Jogador elegivel para responder / pressionar STOP na rodada. */
export function isEligible(playerStatus) {
  return playerStatus === PLAYER_STATUS.PLAYING;
}

export default PLAYER_STATUS;
