import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CorrectionPanel from "../../../src/components/teacher/CorrectionPanel.jsx";

function makeGrid(overrides = {}) {
  return {
    round: { letter: "A", themeName: "Animais" },
    players: [
      {
        playerSessionId: "p1",
        name: "Ana",
        answers: [
          { id: "a1", roundCategoryId: "c1", value: "Ariranha", reviewState: "PENDING", matchesLetter: true, duplicated: false },
          { id: "a2", roundCategoryId: "c2", value: "", reviewState: "BLANK", matchesLetter: true, duplicated: false },
        ],
      },
      {
        playerSessionId: "p2",
        name: "Beto",
        answers: [
          { id: "a3", roundCategoryId: "c1", value: "Arara", reviewState: "VALID", matchesLetter: true, duplicated: true },
        ],
      },
    ],
    categories: [
      { id: "c1", name: "Animal" },
      { id: "c2", name: "Fruta" },
    ],
    eliminated: [],
    ...overrides,
  };
}

describe("CorrectionPanel", () => {
  it("shows a placeholder when there is no grid", () => {
    render(<CorrectionPanel grid={null} onReview={vi.fn()} busy={false} />);
    expect(screen.getByText("A correção aparece assim que a rodada for encerrada.")).toBeInTheDocument();
  });

  it("renders the grid header, summary counts, and per-cell labels", () => {
    render(<CorrectionPanel grid={makeGrid()} onReview={vi.fn()} busy={false} />);
    expect(screen.getByText("Correção — letra A · Animais")).toBeInTheDocument();
    expect(screen.getByText("1 válida(s) · 1 pendente(s)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ana, Animal: Ariranha, pendente" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ana, Fruta: em branco, em branco" })).toBeInTheDocument();
    // p2 has no answer for category "Fruta" -> disabled cell with no answer, value shown as empty.
    const missingCell = screen.getByRole("button", { name: "Beto, Fruta: em branco, em branco" });
    expect(missingCell).toBeDisabled();
  });

  it("shows 'duplicada' and 'fora da letra' qualifiers when applicable", () => {
    render(
      <CorrectionPanel
        grid={makeGrid({
          players: [
            {
              playerSessionId: "p1",
              name: "Ana",
              answers: [
                { id: "a1", roundCategoryId: "c1", value: "Xyz", reviewState: "VALID", matchesLetter: false, duplicated: true },
              ],
            },
          ],
        })}
        onReview={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText(/repetida/)).toBeInTheDocument();
    expect(screen.getByText(/fora da letra/)).toBeInTheDocument();
  });

  it("shows the eliminated players line only when present", () => {
    const { rerender } = render(<CorrectionPanel grid={makeGrid()} onReview={vi.fn()} busy={false} />);
    expect(screen.queryByText(/Eliminados nesta rodada/)).not.toBeInTheDocument();

    rerender(
      <CorrectionPanel
        grid={makeGrid({ eliminated: [{ name: "Carla" }, { name: "Davi" }] })}
        onReview={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("Eliminados nesta rodada (não pontuam): Carla, Davi")).toBeInTheDocument();
  });

  it("cycles the review state on click", async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    render(<CorrectionPanel grid={makeGrid()} onReview={onReview} busy={false} />);

    await user.click(screen.getByRole("button", { name: "Ana, Animal: Ariranha, pendente" }));
    // reviewState PENDING isn't in CYCLE, indexOf === -1, so (-1+1)%4 === 0 -> VALID
    expect(onReview).toHaveBeenCalledWith("a1", "VALID");
  });

  it("disables all cells while busy", () => {
    render(<CorrectionPanel grid={makeGrid()} onReview={vi.fn()} busy={true} />);
    expect(screen.getByRole("button", { name: "Ana, Animal: Ariranha, pendente" })).toBeDisabled();
  });

  it("ignores a click on a cell with no answer", () => {
    const onReview = vi.fn();
    render(<CorrectionPanel grid={makeGrid()} onReview={onReview} busy={false} />);
    // Beto/Fruta cell has no answer and is disabled; user-event respects
    // that and refuses to dispatch, so we fire the click directly to
    // exercise the handler's own `if (!answer) return;` guard.
    fireEvent.click(screen.getByRole("button", { name: "Beto, Fruta: em branco, em branco" }));
    expect(onReview).not.toHaveBeenCalled();
  });

  describe("keyboard navigation", () => {
    // A grid where every cell has an answer, so no cell is disabled and
    // every focus() call in the navigation effect actually succeeds
    // (disabled buttons refuse focus in a real DOM, same as jsdom).
    const fullGrid = makeGrid({
      players: [
        {
          playerSessionId: "p1",
          name: "Ana",
          answers: [
            { id: "a1", roundCategoryId: "c1", value: "Ariranha", reviewState: "PENDING", matchesLetter: true, duplicated: false },
            { id: "a2", roundCategoryId: "c2", value: "Abacaxi", reviewState: "BLANK", matchesLetter: true, duplicated: false },
          ],
        },
        {
          playerSessionId: "p2",
          name: "Beto",
          answers: [
            { id: "a3", roundCategoryId: "c1", value: "Arara", reviewState: "VALID", matchesLetter: true, duplicated: true },
            { id: "a4", roundCategoryId: "c2", value: "Ameixa", reviewState: "VALID", matchesLetter: true, duplicated: false },
          ],
        },
      ],
    });

    it("moves focus with arrow keys, clamped to grid bounds", async () => {
      const user = userEvent.setup();
      render(<CorrectionPanel grid={fullGrid} onReview={vi.fn()} busy={false} />);

      const first = screen.getByRole("button", { name: "Ana, Animal: Ariranha, pendente" });
      fireEvent.focus(first);

      await user.keyboard("{ArrowUp}"); // clamped at row 0
      expect(document.activeElement).toHaveAttribute(
        "aria-label",
        "Ana, Animal: Ariranha, pendente",
      );

      await user.keyboard("{ArrowLeft}"); // clamped at column 0
      expect(document.activeElement).toHaveAttribute(
        "aria-label",
        "Ana, Animal: Ariranha, pendente",
      );

      await user.keyboard("{ArrowRight}");
      expect(document.activeElement).toHaveAttribute("aria-label", "Ana, Fruta: Abacaxi, em branco");

      await user.keyboard("{ArrowDown}");
      expect(document.activeElement).toHaveAttribute("aria-label", "Beto, Fruta: Ameixa, válida");

      await user.keyboard("{ArrowDown}"); // clamped at last row
      expect(document.activeElement).toHaveAttribute("aria-label", "Beto, Fruta: Ameixa, válida");
    });

    it("marks the answer with digit/letter shortcuts and advances a row", async () => {
      const user = userEvent.setup();
      const onReview = vi.fn();
      render(<CorrectionPanel grid={makeGrid()} onReview={onReview} busy={false} />);

      const first = screen.getByRole("button", { name: "Ana, Animal: Ariranha, pendente" });
      fireEvent.focus(first);
      await user.keyboard("2");
      expect(onReview).toHaveBeenCalledWith("a1", "INVALID");
      // Advances to row+1 (Beto, Animal)
      expect(document.activeElement).toHaveAttribute(
        "aria-label",
        expect.stringContaining("Beto, Animal"),
      );
    });

    it("supports letter shortcuts v/i/b/d (case-insensitive)", async () => {
      const user = userEvent.setup();
      const onReview = vi.fn();
      render(<CorrectionPanel grid={makeGrid()} onReview={onReview} busy={false} />);
      const first = screen.getByRole("button", { name: "Ana, Animal: Ariranha, pendente" });
      fireEvent.focus(first);
      await user.keyboard("V");
      expect(onReview).toHaveBeenCalledWith("a1", "VALID");
    });

    it("does nothing on a shortcut key when there is no answer under focus", () => {
      const onReview = vi.fn();
      render(<CorrectionPanel grid={makeGrid()} onReview={onReview} busy={false} />);
      // Beto has no answer at all for "Fruta" (missing from player.answers),
      // unlike Ana's blank-but-present answer — the button is disabled, so
      // we dispatch the keydown directly rather than trying to focus it.
      const missingCell = screen.getByRole("button", { name: "Beto, Fruta: em branco, em branco" });
      fireEvent.keyDown(missingCell, { key: "1" });
      expect(onReview).not.toHaveBeenCalled();
    });

    it("cycles review state with space/enter", async () => {
      const user = userEvent.setup();
      const onReview = vi.fn();
      render(<CorrectionPanel grid={makeGrid()} onReview={onReview} busy={false} />);
      const cell = screen.getByRole("button", { name: "Beto, Animal: Arara, válida" });
      fireEvent.focus(cell);
      await user.keyboard("{Enter}");
      // VALID -> next in CYCLE = INVALID
      expect(onReview).toHaveBeenCalledWith("a3", "INVALID");
    });

    it("ignores space/enter when there is no answer under focus", () => {
      const onReview = vi.fn();
      render(<CorrectionPanel grid={makeGrid()} onReview={onReview} busy={false} />);
      const missingCell = screen.getByRole("button", { name: "Beto, Fruta: em branco, em branco" });
      fireEvent.keyDown(missingCell, { key: " " });
      expect(onReview).not.toHaveBeenCalled();
    });

    it("ignores unmapped keys", async () => {
      const user = userEvent.setup();
      const onReview = vi.fn();
      render(<CorrectionPanel grid={makeGrid()} onReview={onReview} busy={false} />);
      const first = screen.getByRole("button", { name: "Ana, Animal: Ariranha, pendente" });
      fireEvent.focus(first);
      await user.keyboard("z");
      expect(onReview).not.toHaveBeenCalled();
    });
  });
});
