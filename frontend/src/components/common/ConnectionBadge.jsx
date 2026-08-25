/** Indicador de conexao com o servidor. */
export function ConnectionBadge({ connected }) {
  return (
    <span className={`connection${connected ? " connection--on" : ""}`}>
      {connected ? "conectado" : "reconectando..."}
    </span>
  );
}

export default ConnectionBadge;
