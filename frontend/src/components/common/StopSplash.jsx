import { useEffect, useRef, useState } from "react";

const SPLASH_DURATION = 2500;

/**
 * Full-screen dramatic "STOP" overlay shown on student and TV screens
 * simultaneously when someone presses STOP. Animates a spring-bounce
 * giant text, red flash, screen shake, and confetti particles.
 *
 * @param {{ onDone?: () => void }} props
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
      {[...Array(18)].map((_, idx) => (
        <span
          key={idx}
          className="stop-splash__confetti"
          style={{
            "--x": `${8 + (idx * 17) % 84}%`,
            "--delay": `${(idx * 0.07).toFixed(2)}s`,
            "--hue": `${(idx * 37) % 360}`,
          }}
        />
      ))}
      <span className="sr-only">STOP!</span>
    </div>
  );
}

export default StopSplash;
