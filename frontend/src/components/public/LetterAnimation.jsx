import { useEffect, useRef, useState } from "react";

const ALPHABET = "ABCDEFGHIJLMNOPRSTUV".split("");
const CONFETTI_COLORS = ["#ffb800", "#2ecc71", "#3d8bff", "#ff5a5a", "#a855f7", "#ff8a3d"];
const TICKS = 22;
const CONFETTI_COUNT = 14;
const REVEAL_HOLD_MS = 900;

/** Atraso de cada giro: comeca rapido e desacelera (curva quadratica). */
function buildDelays(ticks, min, max) {
  const delays = [];
  for (let i = 0; i < ticks; i += 1) {
    const t = i / (ticks - 1);
    delays.push(Math.round(min + (max - min) * t * t));
  }
  return delays;
}

/** Gera a lista de particulas de confete espalhadas ao redor da letra. */
function buildConfetti(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    angle: (360 / count) * i + (Math.random() * 20 - 10),
    distance: 70 + Math.random() * 50,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: Math.round(Math.random() * 80),
  }));
}

/** A letra girando/revelada, com o brilho e o confete — puramente visual. */
function AnimatedLetter({ display, phase, confetti }) {
  return (
    <div className={`screen__letterWrap screen__letterWrap--${phase}`}>
      {phase === "reveal" ? <div className="screen__burst" aria-hidden="true" /> : null}
      {confetti.map((piece) => (
        <span
          key={piece.id}
          className="screen__confetti"
          style={{
            "--angle": `${piece.angle}deg`,
            "--distance": `${piece.distance}px`,
            "--color": piece.color,
            "--delay": `${piece.delay}ms`,
          }}
        />
      ))}
      <div
        className={`screen__letter${phase === "spinning" ? " screen__letter--spin" : ""}${
          phase === "reveal" ? " screen__letter--reveal" : ""
        }`}
        aria-live="polite"
      >
        {display}
      </div>
    </div>
  );
}

/**
 * Animacao do sorteio (spec 15 e 22) — o grande momento de show da tela
 * publica: a letra gira acelerada, desacelera como um caca-niquel e "bate"
 * na letra final com brilho, confete e fanfarra sonora. A animacao e
 * apenas visual: a letra oficial e a que o servidor enviou.
 */
export function LetterAnimation({ letter, audio }) {
  const [display, setDisplay] = useState(letter ?? "");
  const [phase, setPhase] = useState("idle"); // idle | spinning | reveal | settled
  const [confetti, setConfetti] = useState([]);
  const timerRef = useRef(null);
  const settleTimerRef = useRef(null);
  const audioRef = useRef(audio);
  audioRef.current = audio;

  useEffect(() => {
    clearTimeout(timerRef.current);
    clearTimeout(settleTimerRef.current);

    if (!letter) {
      setDisplay("");
      setPhase("idle");
      setConfetti([]);
      return undefined;
    }

    setPhase("spinning");
    const delays = buildDelays(TICKS, 45, 210);
    let index = 0;

    const tick = () => {
      setDisplay(ALPHABET[Math.floor(Math.random() * ALPHABET.length)]);
      audioRef.current?.play?.("TICK");
      index += 1;
      if (index < delays.length) {
        timerRef.current = setTimeout(tick, delays[index]);
        return;
      }
      setDisplay(letter);
      setPhase("reveal");
      audioRef.current?.play?.("LETTER_REVEAL");
      setConfetti(buildConfetti(CONFETTI_COUNT));
      settleTimerRef.current = setTimeout(() => {
        setPhase("settled");
        setConfetti([]);
      }, REVEAL_HOLD_MS);
    };

    timerRef.current = setTimeout(tick, delays[0]);

    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(settleTimerRef.current);
    };
  }, [letter]);

  // Sem letra sorteada nao ha nada a exibir: um marcador gigante
  // poluiria a tela da TV.
  if (!display) return null;

  return <AnimatedLetter display={display} phase={phase} confetti={confetti} />;
}

export default LetterAnimation;
