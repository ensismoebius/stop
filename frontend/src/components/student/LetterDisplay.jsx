/** Letra sorteada pelo servidor (spec 8 e 15). */
export function LetterDisplay({ letter, status, letterRule = "STARTS_WITH" }) {
  const revealed = Boolean(letter) && status !== "CREATED";
  // A regra da rodada vira o proprio rotulo da letra: lida em voz alta ou
  // batendo o olho, o aluno le "Começa com A" ou "Contém A" e sabe o que
  // vale, sem precisar abrir uma categoria para descobrir.
  const ruleLabel = letterRule === "CONTAINS" ? "Contém" : "Começa com";
  return (
    <div className="letter">
      <span className="letter__label">{ruleLabel}</span>
      <span
        className={`letter__value${revealed ? "" : " letter__value--waiting"}`}
        aria-live="polite"
      >
        {revealed ? letter : "—"}
      </span>
    </div>
  );
}

export default LetterDisplay;
