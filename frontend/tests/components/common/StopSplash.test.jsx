import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import StopSplash from "../../../src/components/common/StopSplash.jsx";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StopSplash", () => {
  it("renders the STOP overlay initially", () => {
    render(<StopSplash />);
    expect(screen.getByRole("alert", { name: "STOP!" })).toBeInTheDocument();
    expect(screen.getByText("STOP")).toBeInTheDocument();
  });

  it("renders 18 confetti pieces", () => {
    const { container } = render(<StopSplash />);
    expect(container.querySelectorAll(".stop-splash__confetti")).toHaveLength(18);
  });

  it("hides itself and calls onDone after the splash duration", () => {
    const onDone = vi.fn();
    render(<StopSplash onDone={onDone} />);
    act(() => vi.advanceTimersByTime(2500));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("works without an onDone callback", () => {
    render(<StopSplash />);
    expect(() => act(() => vi.advanceTimersByTime(2500))).not.toThrow();
  });

  it("clears its timer on unmount", () => {
    const clearSpy = vi.spyOn(global, "clearTimeout");
    const { unmount } = render(<StopSplash />);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
