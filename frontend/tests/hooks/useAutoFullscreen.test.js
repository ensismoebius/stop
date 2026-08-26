import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAutoFullscreen } from "../../src/hooks/useAutoFullscreen.js";

function stubRequestFullscreen(target = document.documentElement) {
  const request = vi.fn(() => Promise.resolve());
  target.requestFullscreen = request;
  return request;
}

afterEach(() => {
  delete document.documentElement.requestFullscreen;
  delete document.documentElement.webkitRequestFullscreen;
  delete document.fullscreenElement;
  delete document.webkitFullscreenElement;
  vi.restoreAllMocks();
});

describe("useAutoFullscreen", () => {
  it("does nothing when disabled", () => {
    const request = stubRequestFullscreen();
    renderHook(() => useAutoFullscreen({ enabled: false }));
    document.dispatchEvent(new Event("pointerdown"));
    expect(request).not.toHaveBeenCalled();
  });

  it("does nothing when fullscreen is unsupported", () => {
    renderHook(() => useAutoFullscreen());
    // No requestFullscreen defined anywhere: should not throw.
    expect(() => document.dispatchEvent(new Event("pointerdown"))).not.toThrow();
  });

  it("requests fullscreen on the first pointerdown", () => {
    const request = stubRequestFullscreen();
    renderHook(() => useAutoFullscreen());
    document.dispatchEvent(new Event("pointerdown"));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("requests fullscreen on the first keydown, using the webkit fallback", () => {
    const request = vi.fn(() => Promise.resolve());
    document.documentElement.webkitRequestFullscreen = request;
    renderHook(() => useAutoFullscreen());
    document.dispatchEvent(new Event("keydown"));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("only attempts once even after multiple gesture events", () => {
    const request = stubRequestFullscreen();
    renderHook(() => useAutoFullscreen());
    document.dispatchEvent(new Event("pointerdown"));
    document.dispatchEvent(new Event("keydown"));
    document.dispatchEvent(new Event("pointerdown"));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not request again when already fullscreen", () => {
    const request = stubRequestFullscreen();
    document.fullscreenElement = document.documentElement;
    renderHook(() => useAutoFullscreen());
    document.dispatchEvent(new Event("pointerdown"));
    expect(request).not.toHaveBeenCalled();
  });

  it("resets the attempt flag when the request promise rejects", async () => {
    const request = vi.fn(() => Promise.reject(new Error("denied")));
    document.documentElement.requestFullscreen = request;
    renderHook(() => useAutoFullscreen());
    document.dispatchEvent(new Event("pointerdown"));
    expect(request).toHaveBeenCalledTimes(1);
    await Promise.resolve().then().catch(() => {});
  });

  it("cleans up listeners on unmount", () => {
    const request = stubRequestFullscreen();
    const { unmount } = renderHook(() => useAutoFullscreen());
    unmount();
    document.dispatchEvent(new Event("pointerdown"));
    expect(request).not.toHaveBeenCalled();
  });
});
