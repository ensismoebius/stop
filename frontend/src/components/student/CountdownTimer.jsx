import { formatClock } from "../../hooks/useServerClock.js";

/**
 * Cronometro visual. E apenas uma representacao: o servidor decide
 * quando o tempo acabou (spec 33).
 */
export function CountdownTimer({ seconds, running }) {
  const urgent = running && seconds !== null && seconds <= 10;
  return (
    <div className={`timer${urgent ? " timer--urgent" : ""}`}>
      <span className="letter__label">Tempo</span>
      <span className="timer__value" aria-live="off">
        {formatClock(seconds)}
      </span>
      <span className="sr-only" aria-live="polite">
        {urgent ? `${seconds} segundos restantes` : ""}
      </span>
    </div>
  );
}

export default CountdownTimer;
