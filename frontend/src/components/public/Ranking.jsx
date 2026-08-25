import { useEffect, useRef, useState } from "react";

const REVEAL_INTERVAL_MS = 1100;
const FIRST_REVEAL_DELAY_MS = 700;
const COUNT_DURATION_MS = 800;

/** Uma linha do ranking: some ate ser revelada, depois conta os pontos subindo do zero. */
function RankingRow({ entry, revealed }) {
  const [value, setValue] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!revealed) return undefined;
    const target = entry.total;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / COUNT_DURATION_MS);
      // ease-out: acelera no comeco, desacelera perto do valor final.
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [revealed, entry.total]);

  if (!revealed) return null;

  const podium = entry.position <= 3 ? ` ranking-reveal__row--p${entry.position}` : "";
  const winner = entry.position === 1 ? " ranking-reveal__row--winner" : "";

  return (
    <li className={`ranking-reveal__row${podium}${winner}`}>
      <span className="ranking-reveal__position">{entry.position}º</span>
      <span className="ranking-reveal__name">
        {entry.avatarUrl ? <img className="ranking-reveal__avatar" src={entry.avatarUrl} alt="" /> : null}
        {entry.name}
      </span>
      <span className="ranking-reveal__total">{value}</span>
    </li>
  );
}

/**
 * Ranking com drama de programa de auditorio: revela do ultimo colocado
 * para o primeiro, uma posicao por vez, com os pontos contando ate o
 * valor final — o 1º lugar so aparece por ultimo.
 */
export function Ranking({ entries, audio }) {
  const shown = (entries ?? []).slice(0, 8);
  const [step, setStep] = useState(0);

  // A dramaturgia reinicia so quando o ranking muda de verdade (nova
  // rodada pontuada), nunca a cada re-render por outro motivo.
  const signature = shown.map((entry) => `${entry.studentId}:${entry.total}`).join("|");
  const signatureRef = useRef(null);
  useEffect(() => {
    if (signatureRef.current !== signature) {
      signatureRef.current = signature;
      setStep(0);
    }
  }, [signature]);

  useEffect(() => {
    if (shown.length === 0 || step >= shown.length) return undefined;
    const delay = step === 0 ? FIRST_REVEAL_DELAY_MS : REVEAL_INTERVAL_MS;
    const timer = setTimeout(() => {
      const revealingWinner = step === shown.length - 1;
      audio?.play(revealingWinner ? "RANKING" : "TICK");
      setStep((current) => current + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [step, shown.length, signature, audio]);

  if (shown.length === 0) return null;

  // Revela de baixo para cima: o ultimo colocado exibido aparece primeiro,
  // o 1º lugar fica guardado para o final.
  const revealFrom = shown.length - step;

  return (
    <div className="ranking-reveal">
      <div className="ranking-reveal__title">🏆 RANKING 🏆</div>
      <ol className="ranking-reveal__list">
        {shown.map((entry, index) => (
          <RankingRow key={entry.studentId} entry={entry} revealed={index >= revealFrom} />
        ))}
      </ol>
    </div>
  );
}

export default Ranking;
