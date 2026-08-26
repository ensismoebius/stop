import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import GameStatus from "../../../src/components/public/GameStatus.jsx";

describe("GameStatus", () => {
  it("defaults to the NONE message when status is undefined", () => {
    render(<GameStatus status={undefined} />);
    expect(screen.getByText("Aguardando jogadores")).toBeInTheDocument();
  });

  it.each([
    ["CREATED", "Preparar!"],
    ["READY", "Letra sorteada"],
    ["STARTING", "Preparar!"],
    ["PLAYING", "VALENDO!"],
    ["STOPPED", "STOP!"],
    ["COLLABORATIVE_CORRECTION", "Correção colaborativa"],
    ["CORRECTION", "Correção do professor"],
    ["SCORED", "Ranking atualizado"],
    ["FINISHED", "Próxima rodada"],
  ])("renders the message for %s", (status, message) => {
    render(<GameStatus status={status} />);
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("falls back to the NONE message for an unknown status", () => {
    render(<GameStatus status="SOMETHING_ELSE" />);
    expect(screen.getByText("Aguardando jogadores")).toBeInTheDocument();
  });
});
