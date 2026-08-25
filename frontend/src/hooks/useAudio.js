import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "stop:audio";

/**
 * Efeitos sonoros por estado (spec 23).
 *
 * Os sons sao sintetizados via WebAudio: nao ha arquivos externos e o jogo
 * funciona normalmente com o audio bloqueado ou desligado. A preferencia
 * fica no armazenamento local.
 */
const CUES = {
  START: [
    { freq: 523, duration: 0.12 },
    { freq: 659, duration: 0.12 },
    { freq: 784, duration: 0.2 },
  ],
  LETTER: [
    { freq: 880, duration: 0.1 },
    { freq: 1174, duration: 0.18 },
  ],
  /** Fanfarra do momento em que a letra realmente para de girar na TV. */
  LETTER_REVEAL: [
    { freq: 659, duration: 0.09, gain: 0.16 },
    { freq: 880, duration: 0.09, gain: 0.16 },
    { freq: 1047, duration: 0.09, gain: 0.16 },
    { freq: 1397, duration: 0.32, gain: 0.2 },
  ],
  TICK: [{ freq: 660, duration: 0.06, gain: 0.05 }],
  FINAL_SECONDS: [{ freq: 440, duration: 0.09 }],
  STOPPED: [
    { freq: 392, duration: 0.14 },
    { freq: 262, duration: 0.3 },
  ],
  CORRECTION: [{ freq: 587, duration: 0.15 }],
  ELIMINATED: [
    { freq: 311, duration: 0.18 },
    { freq: 208, duration: 0.32 },
  ],
  RANKING: [
    { freq: 659, duration: 0.12 },
    { freq: 784, duration: 0.12 },
    { freq: 1047, duration: 0.28 },
  ],
};

function readPreference() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return { enabled: true, volume: 0.4 };
    return JSON.parse(stored);
  } catch {
    return { enabled: true, volume: 0.4 };
  }
}

const VOICE_SRC = "/audio/stop-voice.mp3";

let preloadedVoice = null;
try {
  preloadedVoice = new Audio(VOICE_SRC);
  preloadedVoice.preload = "auto";
  preloadedVoice.volume = 1;
} catch {
  /* SSR ou browser antigo: ignora */
}

export function useAudio() {
  const [preference, setPreference] = useState(readPreference);
  const contextRef = useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
    } catch {
      /* armazenamento indisponivel: segue sem persistir */
    }
  }, [preference]);

  const ensureContext = useCallback(() => {
    if (contextRef.current) return contextRef.current;
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    contextRef.current = new Ctor();
    return contextRef.current;
  }, []);

  /** Deve ser chamado a partir de um gesto do usuario (spec 23). */
  const unlock = useCallback(() => {
    const context = ensureContext();
    if (context && context.state === "suspended") context.resume().catch(() => {});
  }, [ensureContext]);

  const play = useCallback(
    (cue) => {
      if (!preference.enabled) return;
      const steps = CUES[cue];
      if (!steps) return;
      const context = ensureContext();
      if (!context) return;
      if (context.state === "suspended") context.resume().catch(() => {});

      let start = context.currentTime;
      for (const step of steps) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(step.freq, start);
        const peak = (step.gain ?? 0.12) * preference.volume;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + step.duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + step.duration + 0.02);
        start += step.duration;
      }
    },
    [ensureContext, preference],
  );

  const playVoice = useCallback(() => {
    if (!preference.enabled) return;
    if (!preloadedVoice) return;
    try {
      preloadedVoice.currentTime = 0;
      preloadedVoice.volume = preference.volume;
      preloadedVoice.play().catch(() => {});
    } catch {
      /* ignora erro de reproducao */
    }
  }, [preference]);

  return useMemo(
    () => ({
      play,
      playVoice,
      unlock,
      enabled: preference.enabled,
      volume: preference.volume,
      toggle: () => setPreference((current) => ({ ...current, enabled: !current.enabled })),
      setVolume: (volume) => setPreference((current) => ({ ...current, volume })),
    }),
    [play, playVoice, unlock, preference],
  );
}

export default useAudio;
