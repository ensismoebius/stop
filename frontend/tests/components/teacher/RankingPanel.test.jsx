import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RankingPanel from "../../../src/components/teacher/RankingPanel.jsx";

describe("RankingPanel", () => {
  it("shows an empty message when there is no ranking", () => {
    render(<RankingPanel ranking={null} />);
    expect(screen.getByText("Nenhuma pontuação registrada ainda.")).toBeInTheDocument();
  });

  it("shows an empty message when ranking is an empty array", () => {
    render(<RankingPanel ranking={[]} />);
    expect(screen.getByText("Nenhuma pontuação registrada ainda.")).toBeInTheDocument();
  });

  it("renders a table row per entry, with avatar when present", () => {
    render(
      <RankingPanel
        ranking={[
          { studentId: 1, position: 1, name: "Ana", total: 10, avatarUrl: "/a.svg" },
          { studentId: 2, position: 2, name: "Bob", total: 5, avatarUrl: null },
        ]}
      />,
    );

    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(document.querySelector("img.ranking-panel__avatar")).toHaveAttribute("src", "/a.svg");
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 entries
  });
});
