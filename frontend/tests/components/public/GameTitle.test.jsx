import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import GameTitle from "../../../src/components/public/GameTitle.jsx";

describe("GameTitle", () => {
  it("renders the fixed brand title alongside the game name and room code", () => {
    render(<GameTitle name="Turma A" roomCode="XYZ1" />);
    expect(screen.getByText("STOP RN")).toBeInTheDocument();
    expect(screen.getByText("Turma A · XYZ1")).toBeInTheDocument();
  });

  it("renders gracefully with missing name/roomCode", () => {
    render(<GameTitle name={undefined} roomCode={undefined} />);
    expect(screen.getByText("STOP RN")).toBeInTheDocument();
  });
});
