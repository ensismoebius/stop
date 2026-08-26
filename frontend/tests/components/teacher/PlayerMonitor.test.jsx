import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PlayerMonitor from "../../../src/components/teacher/PlayerMonitor.jsx";

describe("PlayerMonitor", () => {
  it("shows a waiting message when there are no players", () => {
    render(<PlayerMonitor players={[]} requiredCount={0} />);
    expect(screen.getByText("Aguardando jogadores entrarem pela sala.")).toBeInTheDocument();
    expect(screen.getByText("0 conectado(s) de 0")).toBeInTheDocument();
  });

  it("counts connected players and renders avatar/initial fallback", () => {
    render(
      <PlayerMonitor
        players={[
          {
            playerSessionId: "p1",
            name: "Ana",
            registrationNumber: "1",
            connected: true,
            avatarUrl: "/a.svg",
            filled: 2,
            roundStatus: "ANSWERING",
          },
          {
            playerSessionId: "p2",
            name: "bob",
            registrationNumber: "2",
            connected: false,
            avatarUrl: null,
            filled: 0,
            roomStatus: "IDLE",
          },
        ]}
        requiredCount={5}
      />,
    );

    expect(screen.getByText("1 conectado(s) de 2")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(document.querySelector("img.player__avatar")).toHaveAttribute("src", "/a.svg");
    expect(screen.getByText("2/5")).toBeInTheDocument();

    // Bob has no avatar: falls back to initial letter, uppercased.
    const bobName = screen.getByText("bob");
    expect(bobName).toHaveAttribute("data-initial", "B");
  });

  it("hides the filled/required counter when requiredCount is 0", () => {
    render(
      <PlayerMonitor
        players={[
          {
            playerSessionId: "p1",
            name: "Ana",
            registrationNumber: "1",
            connected: true,
            avatarUrl: null,
            filled: 0,
          },
        ]}
        requiredCount={0}
      />,
    );
    expect(screen.queryByText(/\/0/)).not.toBeInTheDocument();
  });

  it("falls back to '?' initial when the player has no name", () => {
    render(
      <PlayerMonitor
        players={[
          { playerSessionId: "p1", name: undefined, registrationNumber: "1", connected: false, filled: 0 },
        ]}
        requiredCount={0}
      />,
    );
    const nameEl = document.querySelector(".player__name");
    expect(nameEl).toHaveAttribute("data-initial", "?");
  });
});
