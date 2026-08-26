import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFullscreen } from "../../src/hooks/useFullscreen.js";

afterEach(() => {
  delete document.documentElement.requestFullscreen;
  delete document.documentElement.webkitRequestFullscreen;
  delete document.documentElement.mozRequestFullScreen;
  delete document.exitFullscreen;
  delete document.webkitExitFullscreen;
  delete document.fullscreenElement;
  delete document.webkitFullscreenElement;
  delete document.mozFullScreenElement;
  vi.restoreAllMocks();
});

describe("useFullscreen", () => {
  it("reports unsupported when requestFullscreen is missing", () => {
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.supported).toBe(false);
    expect(result.current.isFullscreen).toBe(false);
  });

  it("reports supported and initial fullscreen state from the document", () => {
    document.documentElement.requestFullscreen = vi.fn();
    document.fullscreenElement = document.documentElement;
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.supported).toBe(true);
    expect(result.current.isFullscreen).toBe(true);
  });

  it("enter() requests fullscreen on the given element and resolves true", async () => {
    const request = vi.fn(() => Promise.resolve());
    document.documentElement.requestFullscreen = request;
    const node = document.createElement("div");
    node.requestFullscreen = request;
    const { result } = renderHook(() => useFullscreen());
    let ok;
    await act(async () => {
      ok = await result.current.enter(node);
    });
    expect(ok).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("enter() defaults to document.documentElement when no element given", async () => {
    const request = vi.fn(() => Promise.resolve());
    document.documentElement.requestFullscreen = request;
    const { result } = renderHook(() => useFullscreen());
    await act(async () => {
      await result.current.enter();
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("enter() uses webkit/moz fallbacks when requestFullscreen is absent", async () => {
    const request = vi.fn(() => Promise.resolve());
    const node = document.createElement("div");
    node.webkitRequestFullscreen = request;
    const { result } = renderHook(() => useFullscreen());
    await act(async () => {
      await result.current.enter(node);
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("enter() resolves false when no request method exists on the node", async () => {
    const node = document.createElement("div");
    const { result } = renderHook(() => useFullscreen());
    let ok;
    await act(async () => {
      ok = await result.current.enter(node);
    });
    expect(ok).toBe(false);
  });

  it("enter() resolves false when the browser rejects the request", async () => {
    const node = document.createElement("div");
    node.requestFullscreen = vi.fn(() => Promise.reject(new Error("denied")));
    const { result } = renderHook(() => useFullscreen());
    let ok;
    await act(async () => {
      ok = await result.current.enter(node);
    });
    expect(ok).toBe(false);
  });

  it("exit() calls exitFullscreen when currently fullscreen", async () => {
    const exit = vi.fn(() => Promise.resolve());
    document.exitFullscreen = exit;
    document.fullscreenElement = document.documentElement;
    const { result } = renderHook(() => useFullscreen());
    await act(async () => {
      await result.current.exit();
    });
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("exit() no-ops when not currently fullscreen", async () => {
    const exit = vi.fn(() => Promise.resolve());
    document.exitFullscreen = exit;
    const { result } = renderHook(() => useFullscreen());
    await act(async () => {
      await result.current.exit();
    });
    expect(exit).not.toHaveBeenCalled();
  });

  it("exit() swallows a rejected exitFullscreen call", async () => {
    document.exitFullscreen = vi.fn(() => Promise.reject(new Error("nope")));
    document.fullscreenElement = document.documentElement;
    const { result } = renderHook(() => useFullscreen());
    await expect(
      act(async () => {
        await result.current.exit();
      }),
    ).resolves.not.toThrow();
  });

  it("calls onExit when transitioning from fullscreen to not-fullscreen", () => {
    document.documentElement.requestFullscreen = vi.fn();
    document.fullscreenElement = document.documentElement;
    const onExit = vi.fn();
    const { result } = renderHook(() => useFullscreen({ onExit }));
    expect(result.current.isFullscreen).toBe(true);

    delete document.fullscreenElement;
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.isFullscreen).toBe(false);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("does not call onExit when entering fullscreen", () => {
    const onExit = vi.fn();
    const { result } = renderHook(() => useFullscreen({ onExit }));
    document.fullscreenElement = document.documentElement;
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.isFullscreen).toBe(true);
    expect(onExit).not.toHaveBeenCalled();
  });

  it("reacts to webkit/moz fullscreenchange variants", () => {
    document.webkitFullscreenElement = document.documentElement;
    const { result } = renderHook(() => useFullscreen());
    act(() => {
      document.dispatchEvent(new Event("webkitfullscreenchange"));
    });
    expect(result.current.isFullscreen).toBe(true);
  });

  it("uses the latest onExit without resubscribing listeners", () => {
    document.fullscreenElement = document.documentElement;
    const onExitFirst = vi.fn();
    const onExitSecond = vi.fn();
    const { result, rerender } = renderHook(({ onExit }) => useFullscreen({ onExit }), {
      initialProps: { onExit: onExitFirst },
    });
    rerender({ onExit: onExitSecond });

    delete document.fullscreenElement;
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.isFullscreen).toBe(false);
    expect(onExitFirst).not.toHaveBeenCalled();
    expect(onExitSecond).toHaveBeenCalledTimes(1);
  });

  it("cleans up listeners on unmount", () => {
    const onExit = vi.fn();
    document.fullscreenElement = document.documentElement;
    const { unmount } = renderHook(() => useFullscreen({ onExit }));
    unmount();
    delete document.fullscreenElement;
    document.dispatchEvent(new Event("fullscreenchange"));
    expect(onExit).not.toHaveBeenCalled();
  });
});
