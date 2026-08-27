import LetterDisplay from "./LetterDisplay.jsx";
import CountdownTimer from "./CountdownTimer.jsx";
import ProgressIndicator from "./ProgressIndicator.jsx";

/** Cabecalho fixo: letra, cronometro e progresso (spec 8). */
export function GameHeader({ round, seconds, running, filled, total }) {
  return (
    <header className="student__header">
      <div className="student__headline">
        <LetterDisplay letter={round?.letter} status={round?.status} letterRule={round?.letterRule} />
        <CountdownTimer seconds={seconds} running={running} />
      </div>
      <ProgressIndicator filled={filled} total={total} />
    </header>
  );
}

export default GameHeader;
