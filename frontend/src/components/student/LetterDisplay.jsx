/** Letra sorteada pelo servidor (spec 8 e 15). */
export function LetterDisplay({ letter, status }) {
  const revealed = Boolean(letter) && status !== "CREATED";
  return (
    <div className="letter">
      <span className="letter__label">Letra</span>
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
