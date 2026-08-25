/** Tema (conjunto de categorias) da rodada atual. */
export function ThemeDisplay({ theme, roundNumber }) {
  if (!theme) return null;
  return (
    <div className="screen__theme">
      {roundNumber ? `Rodada ${roundNumber} — ` : ""}
      {theme}
    </div>
  );
}

export default ThemeDisplay;
