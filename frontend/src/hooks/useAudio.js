import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "stop:audio";

/**
 * Sound cues per game state (spec 23).
 *
 * Sounds are synthesized via WebAudio with no external files. The game
 * works normally even when audio is blocked or muted. User preference
 * is persisted in localStorage.
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
  /** Fanfare when the letter stops spinning on the TV. */
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
  /** Tensão enquanto a próxima colocação do pódio não aparece. */
  DRUMROLL: [
    { freq: 165, duration: 0.05, gain: 0.05 },
    { freq: 165, duration: 0.05, gain: 0.07 },
    { freq: 196, duration: 0.05, gain: 0.09 },
    { freq: 196, duration: 0.05, gain: 0.11 },
    { freq: 233, duration: 0.14, gain: 0.14 },
  ],
  /** 3º e 2º lugares: acorde curto de revelação. */
  PODIUM: [
    { freq: 523, duration: 0.1, gain: 0.16 },
    { freq: 784, duration: 0.24, gain: 0.18 },
  ],
  /** 1º lugar: fanfarra inteira, junto com os fogos. */
  FANFARE: [
    { freq: 523, duration: 0.13, gain: 0.18 },
    { freq: 659, duration: 0.13, gain: 0.18 },
    { freq: 784, duration: 0.13, gain: 0.2 },
    { freq: 1047, duration: 0.16, gain: 0.22 },
    { freq: 1319, duration: 0.55, gain: 0.24 },
  ],
};

/**
 * Read audio preference from localStorage, returning defaults when
 * nothing is stored or parsing fails.
 *
 * @returns {{ enabled: boolean, volume: number }}
 */
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
  /* SSR or legacy browser: ignore */
}

/**
 * Trilhas de fundo (loop), diferente dos bipes sintetizados acima: aqui
 * usamos gravações de verdade porque um beep de WebAudio não faz "música".
 * Todas por Kevin MacLeod (incompetech.com), Creative Commons: By
 * Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/) — os
 * arquivos já carregam essa atribuição nas próprias tags ID3.
 *
 * Cada fase tem varias trilhas candidatas: uma so sorteada a cada troca de
 * fase (`pickTrack`) evita que a mesma musica repita partida apos partida.
 */
const MUSIC_TRACKS = {
  /** Suspense sem agressividade, para não atropelar quem está pensando na
   *  resposta. Toca em loop durante o PLAYING. */
  ROUND: [
    "/audio/round-tension.mp3", // "Ossuary 7 - Resolve"
    "/audio/round-tension-2.mp3", // "Constance"
    "/audio/round-tension-3.mp3", // "Spy Glass"
    "/audio/round-tension-4.mp3", // "Kool Kats"
  ],
  /** Temas comemorativos, em loop durante o pódio. */
  PODIUM: [
    "/audio/podium-celebration.mp3", // "Winner Winner!"
    "/audio/podium-celebration-2.mp3", // "Monkeys Spinning Monkeys"
    "/audio/podium-celebration-3.mp3", // "Life of Riley"
    "/audio/podium-celebration-4.mp3", // "Merry Go"
  ],
};
/** Música fica mais baixa que os efeitos — é ambiente, não é o destaque. */
const MUSIC_GAIN = 0.5;

/** Sorteia uma trilha entre as candidatas da fase (chave de `MUSIC_TRACKS`). */
function pickTrack(key) {
  const tracks = MUSIC_TRACKS[key];
  if (!tracks || tracks.length === 0) return null;
  return tracks[Math.floor(Math.random() * tracks.length)];
}

// Cache por arquivo (nao por fase): cada trilha candidata tem seu proprio
// <audio>, criado sob demanda na primeira vez que e sorteada.
const musicPlayers = {};
function getMusicPlayerForSrc(src) {
  if (!src) return null;
  if (musicPlayers[src]) return musicPlayers[src];
  try {
    const el = new Audio(src);
    el.loop = true;
    el.preload = "auto";
    el.volume = 0;
    musicPlayers[src] = el;
    return el;
  } catch {
    return null;
  }
}

/**
 * `HTMLMediaElement.play()` deveria devolver uma Promise, mas o jsdom (e
 * alguns navegadores restringindo autoplay) pode lançar de forma síncrona
 * ou devolver `undefined` em vez de rejeitar — daí o try/catch em volta do
 * encadeamento inteiro, não só um `.catch()` nele.
 */
function safePlay(el) {
  try {
    el?.play()?.catch(() => {});
  } catch {
    /* autoplay bloqueado ou play() não implementado: silencioso de propósito */
  }
}

// Estado de reprodução de música é módulo-level (como `preloadedVoice`
// acima): só uma trilha por aba, então não há razão para viver por hook.
// `key` é a fase (ROUND/PODIUM); `src` é qual das trilhas candidatas dessa
// fase foi sorteada desta vez — precisamos dos dois: o primeiro pra saber
// se a fase mudou, o segundo pra saber qual <audio> de fato desvanecer.
let activeTrack = { key: null, src: null };
const fadeFrames = {};

/** Sobe/desce o volume de uma trilha suavemente; pausa de fato ao chegar a 0. */
function fadeMusic(el, src, to, ms) {
  if (!el) return;
  if (fadeFrames[src]) cancelAnimationFrame(fadeFrames[src]);
  if (to > 0 && el.paused) safePlay(el);
  const from = el.volume;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    el.volume = from + (to - from) * t;
    if (t < 1) {
      fadeFrames[src] = requestAnimationFrame(step);
    } else {
      delete fadeFrames[src];
      if (to === 0) el.pause();
    }
  };
  fadeFrames[src] = requestAnimationFrame(step);
}

/**
 * Audio hook for the STOP game. Provides synthesized sound cues via
 * WebAudio, a preloaded voice clip for the STOP moment, looping background
 * music, and user preference persistence (mute toggle + volume).
 *
 * @returns {{ play: (cue: string) => void, playVoice: () => void, playMusic: (key: string) => void, stopMusic: () => void, unlock: () => void, enabled: boolean, volume: number, toggle: () => void, setVolume: (v: number) => void }}
 */
export function useAudio() {
  const [preference, setPreference] = useState(readPreference);
  const contextRef = useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
    } catch {
      /* storage unavailable: proceed without persisting */
    }
  }, [preference]);

  const ensureContext = useCallback(() => {
    if (contextRef.current) return contextRef.current;
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    contextRef.current = new Ctor();
    return contextRef.current;
  }, []);

  /**
   * Must be called from a user gesture (spec 23). Um play()+pause() dentro
   * do gesto "destrava" o elemento `<audio>` para autoplay programático
   * depois — o mesmo truque, só que para HTMLMediaElement em vez do
   * AudioContext logo abaixo.
   */
  const unlock = useCallback(() => {
    const context = ensureContext();
    if (context && context.state === "suspended") context.resume().catch(() => {});
    for (const tracks of Object.values(MUSIC_TRACKS)) {
      for (const src of tracks) {
        const el = getMusicPlayerForSrc(src);
        if (!el) continue;
        try {
          el.play()
            ?.then(() => el.pause())
            ?.catch(() => {});
        } catch {
          /* autoplay bloqueado ou play() não implementado: silencioso de proposito */
        }
      }
    }
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
      /* ignore playback error */
    }
  }, [preference]);

  /**
   * Troca para a fase `key`, com crossfade; repetir a mesma fase é no-op.
   * A trilha e sorteada entre as candidatas de `MUSIC_TRACKS[key]` a cada
   * troca — assim partida apos partida a musica varia.
   */
  const playMusic = useCallback(
    (key) => {
      if (activeTrack.key === key) return;
      const previous = activeTrack;
      const src = pickTrack(key);
      activeTrack = { key, src };
      if (previous.src) fadeMusic(getMusicPlayerForSrc(previous.src), previous.src, 0, 500);
      if (!preference.enabled || !src) return;
      const el = getMusicPlayerForSrc(src);
      if (!el) return;
      el.currentTime = 0;
      fadeMusic(el, src, preference.volume * MUSIC_GAIN, 900);
    },
    [preference],
  );

  const stopMusic = useCallback(() => {
    if (!activeTrack.key) return;
    const { src } = activeTrack;
    activeTrack = { key: null, src: null };
    if (src) fadeMusic(getMusicPlayerForSrc(src), src, 0, 700);
  }, []);

  // Mudou o volume ou o mudo enquanto uma trilha tocava: acompanha ao vivo,
  // sem esperar a próxima troca de fase para aplicar a preferência nova.
  useEffect(() => {
    if (!activeTrack.src) return;
    const el = getMusicPlayerForSrc(activeTrack.src);
    fadeMusic(el, activeTrack.src, preference.enabled ? preference.volume * MUSIC_GAIN : 0, 400);
  }, [preference]);

  return useMemo(
    () => ({
      play,
      playVoice,
      playMusic,
      stopMusic,
      unlock,
      enabled: preference.enabled,
      volume: preference.volume,
      toggle: () => setPreference((current) => ({ ...current, enabled: !current.enabled })),
      setVolume: (volume) => setPreference((current) => ({ ...current, volume })),
    }),
    [play, playVoice, playMusic, stopMusic, unlock, preference],
  );
}

export default useAudio;
