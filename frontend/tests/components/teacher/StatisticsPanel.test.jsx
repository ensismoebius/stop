import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StatisticsPanel from "../../../src/components/teacher/StatisticsPanel.jsx";

const statistics = {
  totals: {
    rounds: 3,
    fillRate: 0.8256,
    validAnswers: 20,
    answers: 25,
    stops: 4,
    timeouts: 1,
    eliminations: 2,
    averageSecondsToStop: 12.5,
  },
  byCategory: [{ category: "Animais", answers: 10, filled: 9, valid: 8, totalScore: 40 }],
  byTheme: [{ theme: "Biologia", rounds: 3, validAnswers: 20, invalidAnswers: 5, totalScore: 100 }],
};

const history = {
  rounds: [
    {
      id: "r1",
      roundNumber: 1,
      themeName: "Biologia",
      letter: "A",
      stopReason: "PLAYER_STOP",
      status: "SCORED",
      firstStopper: "Ana",
    },
    {
      id: "r2",
      roundNumber: 2,
      themeName: "Química",
      letter: null,
      stopReason: null,
      status: "CANCELLED",
      firstStopper: null,
    },
  ],
};

describe("StatisticsPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an empty message when there are no statistics", () => {
    render(<StatisticsPanel statistics={null} history={null} onDeleteRound={vi.fn()} busy={false} />);
    expect(screen.getByText("Nenhuma rodada pontuada ainda.")).toBeInTheDocument();
  });

  it("renders summary, per-category and per-theme stats", () => {
    render(<StatisticsPanel statistics={statistics} history={null} onDeleteRound={vi.fn()} busy={false} />);

    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1); // rounds
    expect(screen.getByText("83%")).toBeInTheDocument(); // rounded fillRate
    expect(screen.getAllByText("5").length).toBeGreaterThanOrEqual(1); // invalid answers = 25-20
    expect(screen.getByText("12.5s")).toBeInTheDocument();
    expect(screen.getByText("Animais")).toBeInTheDocument();
    expect(screen.getByText("Biologia")).toBeInTheDocument();
    // No history passed -> round history table absent.
    expect(screen.queryByText("Histórico das rodadas")).not.toBeInTheDocument();
  });

  it("shows an em dash for averageSecondsToStop when null", () => {
    render(
      <StatisticsPanel
        statistics={{ ...statistics, totals: { ...statistics.totals, averageSecondsToStop: null } }}
        history={null}
        onDeleteRound={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders round history with delete button only for SCORED/FINISHED rounds, and confirms before deleting", async () => {
    const user = userEvent.setup();
    const onDeleteRound = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<StatisticsPanel statistics={statistics} history={history} onDeleteRound={onDeleteRound} busy={false} />);

    const removeButtons = screen.getAllByRole("button", { name: "Remover" });
    expect(removeButtons).toHaveLength(1); // only round 1 (SCORED)

    await user.click(removeButtons[0]);
    expect(window.confirm).toHaveBeenCalledWith(
      "Remover a rodada 1 (Biologia) do histórico? Os pontos que ela gerou serão descontados do ranking.",
    );
    expect(onDeleteRound).toHaveBeenCalledWith("r1");

    // Cancelled round shows placeholders for letter/firstStopper and its own status text.
    expect(screen.getByText("Química")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("does not delete when the confirm dialog is dismissed", async () => {
    const user = userEvent.setup();
    const onDeleteRound = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<StatisticsPanel statistics={statistics} history={history} onDeleteRound={onDeleteRound} busy={false} />);
    await user.click(screen.getByRole("button", { name: "Remover" }));

    expect(onDeleteRound).not.toHaveBeenCalled();
  });

  it("hides the delete button entirely when onDeleteRound is not provided", () => {
    render(<StatisticsPanel statistics={statistics} history={history} onDeleteRound={null} busy={false} />);
    expect(screen.queryByRole("button", { name: "Remover" })).not.toBeInTheDocument();
  });

  it("disables the delete button while busy", () => {
    render(<StatisticsPanel statistics={statistics} history={history} onDeleteRound={vi.fn()} busy={true} />);
    expect(screen.getByRole("button", { name: "Remover" })).toBeDisabled();
  });
});
