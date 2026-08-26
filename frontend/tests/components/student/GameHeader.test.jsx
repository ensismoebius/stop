import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import GameHeader from "../../../src/components/student/GameHeader.jsx";

describe("GameHeader", () => {
  it("renders letter, timer, and progress from a round", () => {
    render(
      <GameHeader
        round={{ letter: "A", status: "PLAYING" }}
        seconds={42}
        running
        filled={3}
        total={10}
      />,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("00:42")).toBeInTheDocument();
    expect(screen.getByText("3 / 10 preenchidas")).toBeInTheDocument();
  });

  it("handles a missing round gracefully", () => {
    render(<GameHeader round={null} seconds={null} running={false} filled={0} total={0} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("--:--")).toBeInTheDocument();
    expect(screen.getByText("0 / 0 preenchidas")).toBeInTheDocument();
  });
});
