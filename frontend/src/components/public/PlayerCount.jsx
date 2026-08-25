/** Contagem publica de jogadores; nunca exibe nomes ou matriculas. */
export function PlayerCount({ active, total, eliminated }) {
  return (
    <div className="screen__players">
      {active} {active === 1 ? "jogador ativo" : "jogadores ativos"}
      {total ? ` de ${total}` : ""}
      {eliminated > 0 ? ` · ${eliminated} eliminado(s)` : ""}
    </div>
  );
}

export default PlayerCount;
