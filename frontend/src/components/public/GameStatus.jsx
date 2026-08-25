const MESSAGES = {
  NONE: "Aguardando jogadores",
  CREATED: "Preparar!",
  READY: "Letra sorteada",
  STARTING: "Preparar!",
  PLAYING: "VALENDO!",
  STOPPED: "STOP!",
  COLLABORATIVE_CORRECTION: "Correção colaborativa",
  CORRECTION: "Correção do professor",
  SCORED: "Ranking atualizado",
  FINISHED: "Próxima rodada",
};

/** Mensagens da tela publica (spec 4.3). */
export function GameStatus({ status }) {
  return <div className="screen__status">{MESSAGES[status ?? "NONE"] ?? MESSAGES.NONE}</div>;
}

export default GameStatus;
