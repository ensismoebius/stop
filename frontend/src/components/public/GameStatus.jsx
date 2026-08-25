const MESSAGES = {
  NONE: "Aguardando jogadores",
  CREATED: "Preparar!",
  READY: "Letra sorteada",
  STARTING: "Preparar!",
  PLAYING: "VALENDO!",
  STOPPED: "STOP!",
  CORRECTION: "Correção",
  SCORED: "Ranking atualizado",
  FINISHED: "Próxima rodada",
};

/** Mensagens da tela publica (spec 4.3). */
export function GameStatus({ status }) {
  return <div className="screen__status">{MESSAGES[status ?? "NONE"] ?? MESSAGES.NONE}</div>;
}

export default GameStatus;
