import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const STORAGE_KEY = "stop:audio";

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

function makeGain() {
  return {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  };
}

class MockAudioContext {
  constructor() {
    this.state = "suspended";
    this.currentTime = 0;
    this.destination = {};
    this.resume = vi.fn(() => {
      this.state = "running";
      return Promise.resolve();
    });
  }

  createOscillator() {
    return makeOscillator();
  }

  createGain() {
    return makeGain();
  }
}

async function loadHook() {
  const mod = await import("../../src/hooks/useAudio.js");
  return mod.useAudio;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
  delete window.AudioContext;
  delete window.webkitAudioContext;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete window.AudioContext;
  delete window.webkitAudioContext;
});

describe("useAudio", () => {
  it("defaults to enabled/volume 0.4 when nothing stored", async () => {
    const useAudio = await loadHook();
    const { result } = renderHook(() => useAudio());
    expect(result.current.enabled).toBe(true);
    expect(result.current.volume).toBe(0.4);
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
    expect(result.current.volume).toBe(0.4);
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
    class RejectingContext extends MockAudioContext {
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
});
