import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import Ranking from "../../../src/components/public/Ranking.jsx";

function entry(overrides = {}) {
  return { studentId: "s1", name: "Ana", total: 30, position: 1, avatarUrl: null, ...overrides };
}

beforeEach(() => {
  vi.useFakeTimers();
  // RankingRow's count-up uses requestAnimationFrame keyed off real wall
  // time (performance.now()). Make it deterministic and synchronous: the
  // very first frame reports "well past COUNT_DURATION_MS", so the value
  // settles on the target immediately instead of animating over real time.
  vi.stubGlobal("requestAnimationFrame", (cb) => {
    cb(performance.now() + 100000);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Ranking", () => {
  it("renders nothing when there are no entries", () => {
    const { container } = render(<Ranking entries={[]} audio={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when entries is undefined", () => {
    const { container } = render(<Ranking entries={undefined} audio={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("reveals the last-place entry first, counting its score up to the target", () => {
    const entries = [
      entry({ studentId: "s1", name: "Ana", total: 30, position: 1 }),
      entry({ studentId: "s2", name: "Bia", total: 20, position: 2 }),
    ];
    render(<Ranking entries={entries} audio={null} />);
    expect(screen.getByText("🏆 RANKING 🏆")).toBeInTheDocument();

    // Nothing revealed yet (step 0 -> revealFrom = length).
    expect(screen.queryByText("Bia")).not.toBeInTheDocument();
    expect(screen.queryByText("Ana")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(700); // FIRST_REVEAL_DELAY_MS
    });
    expect(screen.getByText("Bia")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.queryByText("Ana")).not.toBeInTheDocument();
  });

  it("reveals the winner last, with medal and podium/winner styling", () => {
    const entries = [
      entry({ studentId: "s1", name: "Ana", total: 30, position: 1 }),
      entry({ studentId: "s2", name: "Bia", total: 20, position: 2 }),
    ];
    const play = vi.fn();
    const { container } = render(<Ranking entries={entries} audio={{ play }} />);

    act(() => vi.advanceTimersByTime(700)); // reveal 2nd place
    expect(play).toHaveBeenCalledWith("TICK");

    act(() => vi.advanceTimersByTime(1100)); // reveal 1st place (winner)
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(play).toHaveBeenCalledWith("RANKING");

    const winnerRow = container.querySelector(".ranking-reveal__row--winner");
    expect(winnerRow).toBeInTheDocument();
    expect(winnerRow).toHaveTextContent("🥇");
    expect(winnerRow).toHaveClass("ranking-reveal__row--p1");
  });

  it("renders an avatar image when avatarUrl is provided", () => {
    const entries = [entry({ avatarUrl: "/avatars/avatar-01.svg" })];
    const { container } = render(<Ranking entries={entries} audio={null} />);
    act(() => vi.advanceTimersByTime(700));
    expect(container.querySelector(".ranking-reveal__avatar")).toHaveAttribute(
      "src",
      "/avatars/avatar-01.svg",
    );
  });

  it("renders medals only for the top 3 positions", () => {
    const entries = [
      entry({ studentId: "s1", name: "P1", total: 40, position: 1 }),
      entry({ studentId: "s2", name: "P2", total: 30, position: 2 }),
      entry({ studentId: "s3", name: "P3", total: 20, position: 3 }),
      entry({ studentId: "s4", name: "P4", total: 10, position: 4 }),
    ];
    render(<Ranking entries={entries} audio={null} />);
    act(() => vi.advanceTimersByTime(700));
    act(() => vi.advanceTimersByTime(1100));
    act(() => vi.advanceTimersByTime(1100));
    act(() => vi.advanceTimersByTime(1100)); // reveal 4th place, no medal
    expect(screen.getByText("P4").closest("li")).not.toHaveTextContent("🥇");
    expect(screen.getByText("P4").closest("li")).not.toHaveClass("ranking-reveal__row--winner");
  });

  it("caps the shown entries to the top 8", () => {
    const entries = Array.from({ length: 12 }, (_, i) =>
      entry({ studentId: `s${i}`, name: `P${i}`, total: 100 - i, position: i + 1 }),
    );
    render(<Ranking entries={entries} audio={null} />);
    // Reveal everything.
    for (let i = 0; i < 8; i += 1) act(() => vi.advanceTimersByTime(1100));
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
  });

  it("resets the reveal sequence when the ranking signature changes (new round scored)", () => {
    const first = [entry({ studentId: "s1", name: "Ana", total: 30, position: 1 })];
    const { rerender } = render(<Ranking entries={first} audio={null} />);
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByText("Ana")).toBeInTheDocument();

    const second = [entry({ studentId: "s2", name: "Bia", total: 40, position: 1 })];
    rerender(<Ranking entries={second} audio={null} />);
    // Freshly reset: nothing revealed until the first-reveal delay passes again.
    expect(screen.queryByText("Bia")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByText("Bia")).toBeInTheDocument();
  });

  it("does not reset the sequence on a re-render with the same signature", () => {
    const entries = [entry({ studentId: "s1", name: "Ana", total: 30, position: 1 })];
    const { rerender } = render(<Ranking entries={entries} audio={null} />);
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByText("Ana")).toBeInTheDocument();

    rerender(<Ranking entries={[...entries]} audio={null} />);
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it("stops revealing once every entry has been shown (no further timers scheduled)", () => {
    const entries = [entry({ studentId: "s1", name: "Ana", total: 30, position: 1 })];
    render(<Ranking entries={entries} audio={null} />);
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByText("Ana")).toBeInTheDocument();
    // No more timers pending; advancing further must not throw.
    expect(() => act(() => vi.advanceTimersByTime(5000))).not.toThrow();
  });

  it("reschedules another animation frame while the count-up is still in progress", () => {
    // Override the module-level rAF mock for this test only: the first
    // frame reports a small elapsed time (progress < 1, so RankingRow
    // must request another frame), the second reports enough elapsed
    // time to finish (progress >= 1, so it must stop rescheduling).
    let call = 0;
    vi.stubGlobal("requestAnimationFrame", (cb) => {
      call += 1;
      if (call === 1) cb(performance.now() + 1);
      else cb(performance.now() + 100000);
      return call;
    });

    const entries = [entry({ studentId: "s1", name: "Ana", total: 30, position: 1 })];
    render(<Ranking entries={entries} audio={null} />);
    act(() => vi.advanceTimersByTime(700));
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it("cleans up its reveal timer on unmount", () => {
    const entries = [entry()];
    const clearSpy = vi.spyOn(global, "clearTimeout");
    const { unmount } = render(<Ranking entries={entries} audio={null} />);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
