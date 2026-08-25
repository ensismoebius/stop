import { formatClock } from "../../hooks/useServerClock.js";

export function Countdown({ seconds, running }) {
  const urgent = running && seconds !== null && seconds <= 10;
  return (
    <div className={`screen__clock${urgent ? " screen__clock--urgent" : ""}`}>
      {formatClock(seconds)}
    </div>
  );
}

export default Countdown;
