import { useEffect, useRef, useState } from "react";

const SPLASH_DURATION = 2500;

/**
 * Tela cheia dramatica de "STOP" que aparece no aluno e na TV ao mesmo tempo
 * quando alguem aperta STOP. Anima spring-bounce gigante, flash vermelho,
 * screen shake e confetes coloridos.
 */
export function StopSplash({ onDone }) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, SPLASH_DURATION);
    return () => clearTimeout(timerRef.current);
  }, [onDone]);

  if (!visible) return null;

  return (
    <div className="stop-splash" role="alert" aria-label="STOP!">
      <div className="stop-splash__flash" />
      <div className="stop-splash__text-wrap">
        <span className="stop-splash__text">STOP</span>
      </div>
      {[...Array(18)].map((_, i) => (
        <span
          key={i}
          className="stop-splash__confetti"
          style={{
            "--x": `${8 + (i * 17) % 84}%`,
            "--delay": `${(i * 0.07).toFixed(2)}s`,
            "--hue": `${(i * 37) % 360}`,
          }}
        />
      ))}
      <span className="sr-only">STOP!</span>
    </div>
  );
}

export default StopSplash;
