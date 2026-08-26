import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PlayerCount from "../../../src/components/public/PlayerCount.jsx";

describe("PlayerCount", () => {
  it("pluralizes for more than one active player", () => {
    render(<PlayerCount active={5} total={0} eliminated={0} />);
    expect(screen.getByText("5 jogadores ativos")).toBeInTheDocument();
  });

  it("uses the singular form for exactly one active player", () => {
    render(<PlayerCount active={1} total={0} eliminated={0} />);
    expect(screen.getByText("1 jogador ativo")).toBeInTheDocument();
  });

  it("shows the total when provided", () => {
    render(<PlayerCount active={5} total={8} eliminated={0} />);
    expect(screen.getByText("5 jogadores ativos de 8")).toBeInTheDocument();
  });

  it("omits the total segment when falsy", () => {
    render(<PlayerCount active={5} total={0} eliminated={0} />);
    expect(screen.queryByText(/de 0/)).not.toBeInTheDocument();
  });

  it("shows the eliminated count when greater than zero", () => {
    render(<PlayerCount active={5} total={8} eliminated={2} />);
    expect(screen.getByText("5 jogadores ativos de 8 · 2 eliminado(s)")).toBeInTheDocument();
  });

  it("omits the eliminated segment when zero", () => {
    render(<PlayerCount active={5} total={8} eliminated={0} />);
    expect(screen.queryByText(/eliminado/)).not.toBeInTheDocument();
  });
});
