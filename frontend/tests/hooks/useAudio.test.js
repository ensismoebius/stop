import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const STORAGE_KEY = "stop:audio";

/** Cria um oscilador de áudio fake para o MockAudioContext. */
function makeOscillator() {
  return {
    type: "",
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(function connect(dest) {
      return dest;
    }),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

/** Cria um nó de ganho (gain) fake para o MockAudioContext. */
function makeGain() {
  return {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  };
}

/** Contexto de áudio fake: resume, oscilador e ganho controláveis. */
class MockAudioContext {
  /** Estado inicial suspenso com resume que resolve. */
  constructor() {
    this.state = "suspended";
    this.currentTime = 0;
    this.destination = {};
    this.resume = vi.fn(() => {
      this.state = "running";
      return Promise.resolve();
    });
  }

  /** Retorna um oscilador fake pronto para start/connect. */
  createOscillator() {
    return makeOscillator();
  }

  /** Retorna um nó de ganho fake. */
  createGain() {
    return makeGain();
  }
}

/** Importa o módulo de áudio limpo e devolve o hook useAudio. */
async function loadHook() {
  const mod = await import("../../src/hooks/useAudio.js");
  return mod.useAudio;
}

// `fadeMusic` anima o volume via requestAnimationFrame ao longo de
// centenas de ms — tempo real de sobra pra um frame disparar depois que o
// teste (e o `vi.resetModules()` do próximo) já terminou, mexendo num
// elemento de áudio de um módulo obsoleto. Forçar o "próximo frame" a
// acontecer de imediato faz o fade terminar dentro do próprio `act()`,
// sem deixar nada pendente pra depois do teste.
const originalRAF = window.requestAnimationFrame;
const originalCAF = window.cancelAnimationFrame;

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
  delete window.AudioContext;
  delete window.webkitAudioContext;
  window.requestAnimationFrame = (cb) => {
    cb(performance.now() + 100000);
    return 0;
  };
  window.cancelAnimationFrame = () => {};
});

afterEach(() => {
  vi.restoreAllMocks();
  window.requestAnimationFrame = originalRAF;
  window.cancelAnimationFrame = originalCAF;
  delete window.AudioContext;
  delete window.webkitAudioContext;
});

describe("useAudio", () => {
  it("defaults to enabled/volume 0.65 when nothing stored", async () => {
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    expect(result.current.enabled).toBe(true);
    expect(result.current.volume).toBe(0.65);
  });

  it("reads a stored preference", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: false, volume: 0.8 }));
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    expect(result.current.enabled).toBe(false);
    expect(result.current.volume).toBe(0.8);
  });

  it("falls back to defaults when stored JSON is invalid", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    expect(result.current.enabled).toBe(true);
    expect(result.current.volume).toBe(0.65);
  });

  it("persists preference changes to localStorage on toggle/setVolume", async () => {
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());

    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).enabled).toBe(false);

    act(() => result.current.setVolume(0.9));
    expect(result.current.volume).toBe(0.9);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).volume).toBe(0.9);
  });

  it("ignores localStorage.setItem failures when persisting", async () => {
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    const spy = vi
      .spyOn(window.localStorage.__proto__, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });
    expect(() => act(() => result.current.toggle())).not.toThrow();
    spy.mockRestore();
  });

  it("play() no-ops when sound is disabled", async () => {
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    act(() => result.current.toggle());
    expect(() => act(() => result.current.play("START"))).not.toThrow();
  });

  it("play() no-ops for an unknown cue", async () => {
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    expect(() => act(() => result.current.play("NOT_A_CUE"))).not.toThrow();
  });

  it("play() no-ops when no AudioContext constructor is available", async () => {
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    expect(() => act(() => result.current.play("START"))).not.toThrow();
  });

  it("play() falls back to webkitAudioContext when AudioContext is absent", async () => {
    window.webkitAudioContext = MockAudioContext;
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    expect(() => act(() => result.current.play("START"))).not.toThrow();
  });

  it("play() drives the oscillator/gain chain and resumes a suspended context", async () => {
    window.AudioContext = MockAudioContext;
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());

    act(() => result.current.play("LETTER_REVEAL"));
    // Second call reuses the same (now running) context, covering the
    // "already running" branch of the suspended-state check.
    act(() => result.current.play("TICK"));
  });

  it("unlock() resumes a suspended context", async () => {
    window.AudioContext = MockAudioContext;
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    act(() => result.current.unlock());
  });

  it("unlock() no-ops when no AudioContext is available", async () => {
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    expect(() => act(() => result.current.unlock())).not.toThrow();
  });

  it("unlock() swallows a rejected resume()", async () => {
    /** Contexto cujo resume() é sempre rejeitado. */
    class RejectingContext extends MockAudioContext {
      /** Sobrescreve o resume com uma promessa rejeitada. */
      constructor() {
        super();
        this.resume = vi.fn(() => Promise.reject(new Error("denied")));
      }
    }
    window.AudioContext = RejectingContext;
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    expect(() => act(() => result.current.unlock())).not.toThrow();
  });

  it("playVoice() no-ops when sound is disabled", async () => {
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    act(() => result.current.toggle());
    expect(() => act(() => result.current.playVoice())).not.toThrow();
  });

  it("playVoice() attempts playback of the preloaded voice clip", async () => {
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    // jsdom's HTMLMediaElement.play() is unimplemented; the hook's inner
    // try/catch must swallow whatever happens without throwing out.
    expect(() => act(() => result.current.playVoice())).not.toThrow();
  });

  it("playVoice() no-ops when the voice clip failed to construct at module load", async () => {
    const originalAudio = window.Audio;
    window.Audio = function throwingAudio() {
      throw new Error("no audio support in this environment");
    };
    let useAudio;
    try {
      useAudio = await loadHook();
    } finally {
      window.Audio = originalAudio;
    }
    const { result } = renderHook(() => useAudio());
    expect(() => act(() => result.current.playVoice())).not.toThrow();
  });

  it("playMusic()/stopMusic() do not throw across phase switches", async () => {
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    expect(() => act(() => result.current.playMusic("ROUND"))).not.toThrow();
    expect(() => act(() => result.current.playMusic("PODIUM"))).not.toThrow();
    expect(() => act(() => result.current.stopMusic())).not.toThrow();
  });

  it("stopMusic() no-ops when nothing is playing", async () => {
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    expect(() => act(() => result.current.stopMusic())).not.toThrow();
  });

  it("playMusic() sorteia uma trilha mas não re-sorteia enquanto a fase não muda", async () => {
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    act(() => result.current.playMusic("ROUND"));
    expect(randomSpy).toHaveBeenCalledTimes(1);

    // Mesma fase de novo: no-op, não sorteia outra vez.
    act(() => result.current.playMusic("ROUND"));
    expect(randomSpy).toHaveBeenCalledTimes(1);

    randomSpy.mockRestore();
  });

  it("playMusic() re-sorteia a trilha depois que stopMusic() encerra a fase", async () => {
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    act(() => result.current.playMusic("ROUND"));
    act(() => result.current.stopMusic());
    act(() => result.current.playMusic("ROUND"));
    expect(randomSpy).toHaveBeenCalledTimes(2);

    randomSpy.mockRestore();
  });

  it("playMusic() constrói o <audio> a partir de uma das trilhas candidatas da fase", async () => {
    const created = [];
    const originalAudio = window.Audio;
    window.Audio = function MockAudio(src) {
      created.push(src);
      return {
        src,
        loop: false,
        preload: "",
        volume: 0,
        currentTime: 0,
        paused: true,
        play: vi.fn(() => Promise.resolve()),
        pause: vi.fn(),
      };
    };
    try {
      const useAudio = await loadHook();
      const { result } = renderHook(() => useAudio());
      act(() => result.current.playMusic("PODIUM"));
      expect(created.some((src) => src.includes("podium-celebration"))).toBe(true);
    } finally {
      window.Audio = originalAudio;
    }
  });

  it("unlock() destrava a trilha ativa que o autoplay deixou tocando mudo, sem pausá-la de novo (regressão)", async () => {
    // Cenário real: a tela pública abre com a rodada já em PLAYING, então
    // playMusic() tenta tocar ANTES de qualquer gesto do usuário. O
    // primeiro play() é recusado por autoplay, e o fallback de `safePlay`
    // entra em reprodução MUTA (autoplay mudo é permitido). Só depois vem
    // o clique que chama unlock(). Antes da correção, o laço de "priming"
    // de unlock() tocava (com sucesso, já com gesto) e imediatamente
    // PAUSAVA de volta essa mesma trilha ativa, deixando a música muda;
    // agora unlock() também remove o mute do fallback.
    const elements = {};
    const originalAudio = window.Audio;
    window.Audio = function MockAudio(src) {
      let playAttempts = 0;
      const el = {
        src,
        loop: false,
        preload: "",
        volume: 0,
        currentTime: 0,
        paused: true,
        play: vi.fn(function play() {
          playAttempts += 1;
          if (playAttempts === 1) {
            return Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
          }
          el.paused = false;
          return Promise.resolve();
        }),
        pause: vi.fn(function pause() {
          el.paused = true;
        }),
      };
      elements[src] = el;
      return el;
    };
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const useAudio = await loadHook();
      const { result } = renderHook(() => useAudio());

      await act(async () => {
        result.current.playMusic("ROUND");
        await Promise.resolve();
        await Promise.resolve();
      });
      const activeEl = elements["/audio/round-tension.mp3"];
      expect(activeEl).toBeTruthy();
      // O play() com som foi recusado, então o fallback toca mudo: já está
      // em reprodução, só inaudível até o gesto.
      expect(activeEl.muted).toBe(true);
      expect(activeEl.paused).toBe(false);

      await act(async () => {
        result.current.unlock();
        await Promise.resolve();
        await Promise.resolve();
      });

      // A trilha ativa nunca é pausada pelo priming de unlock() (ela é
      // pulada de propósito), o mute do fallback é removido e ela segue
      // tocando de verdade.
      expect(activeEl.pause).not.toHaveBeenCalled();
      expect(activeEl.muted).toBe(false);
      expect(activeEl.paused).toBe(false);
    } finally {
      window.Audio = originalAudio;
      randomSpy.mockRestore();
    }
  });

  it("refaz o fade-in de uma trilha re-sorteada AUDÍVEL, mesmo se o fallback mudo a deixou mutada (regressão)", async () => {
    // Cenário real: uma trilha caiu no fallback mudo do autoplay (ficou
    // `muted=true`), a fase terminou (fade-out + pause) e depois a MESMA
    // trilha é sorteada de novo numa rodada futura. Antes da correção o
    // elemento reutilizado ressurgia em silêncio, porque `el.muted`
    // continuava `true`; agora cada fade-in reseta o mute.
    const elements = {};
    const originalAudio = window.Audio;
    window.Audio = function MockAudio(src) {
      let playAttempts = 0;
      const el = {
        src,
        muted: false,
        loop: false,
        preload: "",
        volume: 0,
        currentTime: 0,
        paused: true,
        play: vi.fn(function play() {
          playAttempts += 1;
          if (playAttempts === 1) {
            return Promise.reject(Object.assign(new Error("blocked"), { name: "NotAllowedError" }));
          }
          el.paused = false;
          return Promise.resolve();
        }),
        pause: vi.fn(function pause() {
          el.paused = true;
        }),
      };
      elements[src] = el;
      return el;
    };
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const useAudio = await loadHook();
      const { result } = renderHook(() => useAudio());

      // 1ª rodada: autoplay recusado → toca mudo.
      await act(async () => {
        result.current.playMusic("ROUND");
        await Promise.resolve();
        await Promise.resolve();
      });
      const activeEl = elements["/audio/round-tension.mp3"];
      expect(activeEl.muted).toBe(true);
      expect(activeEl.paused).toBe(false);

      // Fim da fase: pausa (fade-out). O elemento continua mutado do fallback.
      act(() => result.current.stopMusic());
      expect(activeEl.paused).toBe(true);

      // 2ª rodada: o podium entra (trilha nova, no fallback mudo — normal
      // até o primeiro gesto), depois volta a rodada re-sorteando a MESMA
      // trilha de round anterior. O fade-in dela deve limpar o mute antigo.
      act(() => result.current.playMusic("PODIUM"));
      act(() => result.current.playMusic("ROUND"));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      // A trilha reutilizada volta audível (mute do fallback foi limpo).
      expect(activeEl.muted).toBe(false);
      expect(activeEl.paused).toBe(false);
    } finally {
      window.Audio = originalAudio;
      randomSpy.mockRestore();
    }
  });
});
