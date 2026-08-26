import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEmojiBursts } from "../../src/hooks/useEmojiBursts.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useEmojiBursts", () => {
  it("starts with an empty queue", () => {
    const { result } = renderHook(() => useEmojiBursts());
    expect(result.current.items).toEqual([]);
  });

  it("pushes a new burst item", () => {
    const { result } = renderHook(() => useEmojiBursts());
    act(() => result.current.push("🔥"));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].emoji).toBe("🔥");
    expect(typeof result.current.items[0].x).toBe("number");
  });

  it("removes the item automatically after its lifetime", () => {
    const { result } = renderHook(() => useEmojiBursts());
    act(() => result.current.push("😂"));
    expect(result.current.items).toHaveLength(1);
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.items).toHaveLength(0);
  });

  it("supports multiple concurrent bursts with distinct ids", () => {
    const { result } = renderHook(() => useEmojiBursts());
    act(() => {
      result.current.push("👍");
      result.current.push("🎉");
    });
    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0].id).not.toBe(result.current.items[1].id);
  });
});
