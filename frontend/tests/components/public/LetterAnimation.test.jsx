import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import LetterAnimation from "../../../src/components/public/LetterAnimation.jsx";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LetterAnimation", () => {
  it("renders nothing when there is no letter", () => {
    const { container } = render(<LetterAnimation letter={null} audio={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("starts spinning through random letters immediately after a letter is set", () => {
    const { container } = render(<LetterAnimation letter="A" audio={null} />);
    expect(container.querySelector(".screen__letterWrap--spinning")).toBeInTheDocument();
    expect(container.querySelector(".screen__letter--spin")).toBeInTheDocument();
  });

  it("plays TICK cues while spinning and settles on the target letter with a reveal", () => {
    const play = vi.fn();
    const { container } = render(<LetterAnimation letter="B" audio={{ play }} />);

    // The 22 spin ticks take ~2225ms total to complete (quadratic
    // easing, 45ms..210ms per tick); reveal begins right after. Advance
    // past that but short of the 900ms settle-hold timer scheduled once
    // reveal begins, so we can observe the intermediate "reveal" phase.
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByText("B")).toBeInTheDocument();
    expect(container.querySelector(".screen__letterWrap--reveal")).toBeInTheDocument();
    expect(container.querySelector(".screen__burst")).toBeInTheDocument();
    expect(container.querySelectorAll(".screen__confetti").length).toBeGreaterThan(0);
    expect(play).toHaveBeenCalledWith("TICK");
    expect(play).toHaveBeenCalledWith("LETTER_REVEAL");
  });

  it("settles from reveal to the final settled phase after the hold duration", () => {
    const { container } = render(<LetterAnimation letter="C" audio={null} />);
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(container.querySelector(".screen__letterWrap--reveal")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector(".screen__letterWrap--settled")).toBeInTheDocument();
    expect(container.querySelectorAll(".screen__confetti")).toHaveLength(0);
  });

  it("resets to idle when the letter is cleared", () => {
    const { container, rerender } = render(<LetterAnimation letter="D" audio={null} />);
    rerender(<LetterAnimation letter={null} audio={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("restarts the spin sequence when the letter changes", () => {
    const { container, rerender } = render(<LetterAnimation letter="E" audio={null} />);
    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByText("E")).toBeInTheDocument();

    rerender(<LetterAnimation letter="F" audio={null} />);
    expect(container.querySelector(".screen__letterWrap--spinning")).toBeInTheDocument();
    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByText("F")).toBeInTheDocument();
  });

  it("tolerates a missing audio prop entirely (optional chaining)", () => {
    expect(() =>
      render(<LetterAnimation letter="G" audio={undefined} />),
    ).not.toThrow();
    expect(() => act(() => vi.runAllTimers())).not.toThrow();
  });

  it("clears timers on unmount", () => {
    const clearSpy = vi.spyOn(global, "clearTimeout");
    const { unmount } = render(<LetterAnimation letter="H" audio={null} />);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
