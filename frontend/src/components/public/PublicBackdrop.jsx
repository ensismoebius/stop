import { useMemo } from "react";

const CLOUDS = [
  { id: 1, left: "6%", top: "14%", scale: 1, delay: 0 },
  { id: 2, left: "28%", top: "9%", scale: 0.7, delay: -18 },
  { id: 3, left: "52%", top: "17%", scale: 1.1, delay: -30 },
  { id: 4, left: "74%", top: "11%", scale: 0.8, delay: -8 },
  { id: 5, left: "89%", top: "18%", scale: 1, delay: -24 },
];

const HILLS = [
  { id: 1, left: "-5%", scale: 1, delay: 0 },
  { id: 2, left: "18%", scale: 0.6, delay: -8 },
  { id: 3, left: "40%", scale: 1.3, delay: -16 },
  { id: 4, left: "68%", scale: 0.75, delay: -24 },
  { id: 5, left: "88%", scale: 1.1, delay: -6 },
];

const BUSHES = [
  { id: 1, left: "8%", scale: 1, delay: 0 },
  { id: 2, left: "24%", scale: 0.7, delay: -5 },
  { id: 3, left: "42%", scale: 1.2, delay: -11 },
  { id: 4, left: "60%", scale: 0.8, delay: -16 },
  { id: 5, left: "76%", scale: 1, delay: -20 },
  { id: 6, left: "92%", scale: 0.6, delay: -26 },
];

/**
 * Cenário estilo "Mario World" para a tela pública: colinas, nuvens e
 * arbustos parecem deslizar suavemente na horizontal (parallax), sobre as
 * bolhas de cor de fundo. Compartilhado por todas as fases — lobby/pré-rodada,
 * ranking e pódio (variante `podium` ganha a estrela que deriva). Puro CSS.
 *
 * @param {{ variant?: "default"|"podium" }} props
 */
export function PublicBackdrop({ variant = "default" }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        x: ((i * 53 + 11) % 100),
        y: ((i * 37 + 7) % 100),
        delay: ((i % 8) * 0.9).toFixed(1),
        dur: (8 + (i % 5)).toFixed(0),
        size: (0.15 + (i % 4) * 0.1).toFixed(2),
      })),
    [],
  );

  return (
    <div
      className={`screen__backdrop${variant === "podium" ? " screen__backdrop--podium" : ""}`}
      aria-hidden="true"
    >
      <span className="screen__backdrop-blob screen__backdrop-blob--1" />
      <span className="screen__backdrop-blob screen__backdrop-blob--2" />
      <span className="screen__backdrop-blob screen__backdrop-blob--3" />

      {/* Camada de nuvens, mais lenta (parallax profundo). */}
      <div className="screen__backdrop-nubes screen__backdrop-nubes--far">
        {CLOUDS.map((c) => (
          <span
            key={c.id}
            className="screen__backdrop-nube"
            style={{ left: c.left, top: c.top, "--fx-scale": c.scale, "--fx-delay": `${c.delay}s` }}
          />
        ))}
      </div>

      {/* Camada de colinas + arbustos, mais rápida (parallax próximo). */}
      <div className="screen__backdrop-terreno">
        {HILLS.map((h) => (
          <span
            key={h.id}
            className="screen__backdrop-hill"
            style={{ left: h.left, "--fx-scale": h.scale, "--fx-delay": `${h.delay}s` }}
          />
        ))}
        {BUSHES.map((b) => (
          <span
            key={b.id}
            className="screen__backdrop-bush"
            style={{ left: b.left, "--fx-scale": b.scale, "--fx-delay": `${b.delay}s` }}
          />
        ))}
      </div>

      {variant === "podium" ? <span className="screen__backdrop-stars" /> : null}

      {particles.map((p) => (
        <span
          key={p.id}
          className="screen__backdrop-particle"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            width: `${p.size}rem`,
            height: `${p.size}rem`,
          }}
        />
      ))}
    </div>
  );
}

export default PublicBackdrop;
