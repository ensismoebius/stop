import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { formatClock, useCountdown, useServerClock } from "../../src/hooks/useServerClock.js";

describe("formatClock", () => {
  it("renders placeholder for null/undefined", () => {
    expect(formatClock(null)).toBe("--:--");
    expect(formatClock(undefined)).toBe("--:--");
  });

  it("formats minutes and seconds with padding", () => {
    expect(formatClock(5)).toBe("00:05");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(600)).toBe("10:00");
  });

  it("clamps negative values to zero and floors fractions", () => {
    expect(formatClock(-5)).toBe("00:00");
    expect(formatClock(59.9)).toBe("00:59");
  });
});

describe("useServerClock", () => {
  it("now() equals Date.now() before any sync", () => {
    const { result } = renderHook(() => useServerClock());
    const before = Date.now();
    expect(Math.abs(result.current.now() - before)).toBeLessThan(50);
  });

  it("sync() ignores a falsy serverTime", () => {
    const { result } = renderHook(() => useServerClock());
    act(() => result.current.sync(null));
    expect(result.current.offsetRef.current).toBe(0);
  });

  it("sync() ignores an unparsable serverTime", () => {
    const { result } = renderHook(() => useServerClock());
    act(() => result.current.sync("not-a-date"));
    expect(result.current.offsetRef.current).toBe(0);
  });

  it("sync() computes an offset applied by now()", () => {
    const { result } = renderHook(() => useServerClock());
    const future = new Date(Date.now() + 10000).toISOString();
    act(() => result.current.sync(future));
    expect(result.current.offsetRef.current).toBeGreaterThan(9000);
    expect(result.current.now() - Date.now()).toBeGreaterThan(9000);
  });
});

describe("useCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when endsAt is falsy", () => {
    const now = () => Date.now();
    const { result } = renderHook(() => useCountdown(null, now));
    expect(result.current).toBeNull();
  });

  it("computes remaining seconds and ticks down every 250ms", () => {
    const base = Date.now();
    const now = vi.fn(() => base);
    const endsAt = new Date(base + 5000).toISOString();
    const { result, rerender } = renderHook(({ endsAt, now }) => useCountdown(endsAt, now), {
      initialProps: { endsAt, now },
    });
    expect(result.current).toBe(5);

    now.mockImplementation(() => base + 2000);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe(3);
    rerender({ endsAt, now });
  });

  it("clamps remaining time to zero once the target has passed", () => {
    const base = Date.now();
    const now = vi.fn(() => base);
    const endsAt = new Date(base + 1000).toISOString();
    const { result } = renderHook(() => useCountdown(endsAt, now));
    expect(result.current).toBe(1);

    now.mockImplementation(() => base + 5000);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe(0);
  });

  it("resets to null and clears the interval when endsAt becomes falsy", () => {
    const base = Date.now();
    const now = () => base;
    const endsAt = new Date(base + 1000).toISOString();
    const { result, rerender } = renderHook(({ endsAt }) => useCountdown(endsAt, now), {
      initialProps: { endsAt },
    });
    expect(result.current).toBe(1);
    rerender({ endsAt: null });
    expect(result.current).toBeNull();
  });

  it("clears its interval on unmount", () => {
    const base = Date.now();
    const now = () => base;
    const endsAt = new Date(base + 1000).toISOString();
    const clearSpy = vi.spyOn(global, "clearInterval");
    const { unmount } = renderHook(() => useCountdown(endsAt, now));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
