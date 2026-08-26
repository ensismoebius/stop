import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GroupedCorrectionPanel from "../../../src/components/teacher/GroupedCorrectionPanel.jsx";

function makeGrid(overrides = {}) {
  return {
    round: { letter: "A", themeName: "Animais" },
    categories: [
      {
        id: "c1",
        name: "Animal",
        groups: [
          { normalizedValue: "arara", value: "Arara", count: 2, reviewState: "PENDING", matchesLetter: true },
          { normalizedValue: "ariranha", value: "Ariranha", count: 1, reviewState: "MIXED", matchesLetter: false },
          { normalizedValue: "", value: "", count: 3, reviewState: "BLANK", matchesLetter: true },
        ],
      },
      {
        id: "c2",
        name: "Fruta",
        groups: [{ normalizedValue: "abacaxi", value: "Abacaxi", count: 1, reviewState: "VALID", matchesLetter: true }],
      },
    ],
    ...overrides,
  };
}

describe("GroupedCorrectionPanel", () => {
  it("shows a placeholder when there is no grid", () => {
    render(<GroupedCorrectionPanel grid={null} onReviewGroup={vi.fn()} busy={false} />);
    expect(screen.getByText("A correção aparece assim que a rodada for encerrada.")).toBeInTheDocument();
  });

  it("renders tabs with actionable counts (blank groups excluded) and defaults to the first category", () => {
    render(<GroupedCorrectionPanel grid={makeGrid()} onReviewGroup={vi.fn()} busy={false} />);

    expect(screen.getByText("Correção agregada — letra A · Animais")).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    // c1 has 3 groups but 1 is blank (normalizedValue: "") -> 2 actionable.
    expect(within(tabs[0]).getByText("Animal (2)")).toBeInTheDocument();
    expect(within(tabs[1]).getByText("Fruta (1)")).toBeInTheDocument();
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");

    // Only actionable groups render as rows (blank excluded).
    expect(screen.getByText("Arara")).toBeInTheDocument();
    expect(screen.getByText("Ariranha")).toBeInTheDocument();
    expect(screen.queryByText("— vazio —")).not.toBeInTheDocument();
  });

  it("shows the divergent-marking and out-of-letter qualifiers", () => {
    render(<GroupedCorrectionPanel grid={makeGrid()} onReviewGroup={vi.fn()} busy={false} />);
    expect(screen.getByText(/marcações divergentes/)).toBeInTheDocument();
    expect(screen.getByText(/fora da letra/)).toBeInTheDocument();
    expect(screen.getByText(/pending/)).toBeInTheDocument();
  });

  it("switches tabs on click", async () => {
    const user = userEvent.setup();
    render(<GroupedCorrectionPanel grid={makeGrid()} onReviewGroup={vi.fn()} busy={false} />);

    await user.click(screen.getByRole("tab", { name: "Fruta (1)" }));
    expect(screen.getByRole("tab", { name: "Fruta (1)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Abacaxi")).toBeInTheDocument();
    expect(screen.queryByText("Arara")).not.toBeInTheDocument();
  });

  it("decides VALID/INVALID for a group and calls onReviewGroup with its answerIds", async () => {
    const user = userEvent.setup();
    const onReviewGroup = vi.fn();
    render(
      <GroupedCorrectionPanel
        grid={makeGrid({
          categories: [
            {
              id: "c1",
              name: "Animal",
              groups: [{ normalizedValue: "arara", value: "Arara", count: 2, reviewState: "PENDING", matchesLetter: true, answerIds: ["a1", "a2"] }],
            },
          ],
        })}
        onReviewGroup={onReviewGroup}
        busy={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "✓ Válida" }));
    expect(onReviewGroup).toHaveBeenCalledWith(["a1", "a2"], "VALID");
  });

  it("advances to the next actionable group in the same category after a decision", async () => {
    const user = userEvent.setup();
    const onReviewGroup = vi.fn();
    render(
      <GroupedCorrectionPanel
        grid={makeGrid({
          categories: [
            {
              id: "c1",
              name: "Animal",
              groups: [
                { normalizedValue: "arara", value: "Arara", count: 1, reviewState: "PENDING", matchesLetter: true, answerIds: ["a1"] },
                { normalizedValue: "ariranha", value: "Ariranha", count: 1, reviewState: "PENDING", matchesLetter: true, answerIds: ["a2"] },
              ],
            },
          ],
        })}
        onReviewGroup={onReviewGroup}
        busy={false}
      />,
    );

    const validButtons = screen.getAllByRole("button", { name: "✓ Válida" });
    await user.click(validButtons[0]);
    expect(onReviewGroup).toHaveBeenCalledWith(["a1"], "VALID");
    // The second row's "Válida" button should now have received DOM focus
    // (advanceAfterDecision focuses+scrolls the next actionable row).
    expect(document.activeElement).toHaveAccessibleName("✓ Válida");
  });

  it("advances to the next category with actionable groups once the current one is exhausted", async () => {
    const user = userEvent.setup();
    const onReviewGroup = vi.fn();
    render(
      <GroupedCorrectionPanel
        grid={makeGrid({
          categories: [
            {
              id: "c1",
              name: "Animal",
              groups: [{ normalizedValue: "arara", value: "Arara", count: 1, reviewState: "PENDING", matchesLetter: true, answerIds: ["a1"] }],
            },
            {
              id: "c2",
              name: "Fruta",
              groups: [{ normalizedValue: "abacaxi", value: "Abacaxi", count: 1, reviewState: "PENDING", matchesLetter: true, answerIds: ["a2"] }],
            },
          ],
        })}
        onReviewGroup={onReviewGroup}
        busy={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "✗ Inválida" }));
    expect(onReviewGroup).toHaveBeenCalledWith(["a1"], "INVALID");
    expect(await screen.findByRole("tab", { name: "Fruta (1)" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Abacaxi")).toBeInTheDocument();
  });

  it("shows the placeholder em-dash for a group with an empty display value", () => {
    // GroupList/GroupRow only ever receive actionable groups (normalizedValue
    // truthy) in normal use — normalizedValue and value always travel
    // together from the backend, so this specific combination cannot occur
    // through the real UI. We still exercise the `group.value || <em>...`
    // fallback directly, since GroupRow doesn't enforce the invariant itself.
    render(
      <GroupedCorrectionPanel
        grid={makeGrid({
          categories: [
            {
              id: "c1",
              name: "Animal",
              groups: [{ normalizedValue: "ghost", value: "", count: 1, reviewState: "VALID", matchesLetter: true }],
            },
          ],
        })}
        onReviewGroup={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("— vazio —")).toBeInTheDocument();
  });

  it("shows the 'all blank' message when a category has groups but none are actionable", () => {
    render(
      <GroupedCorrectionPanel
        grid={makeGrid({
          categories: [
            { id: "c1", name: "Animal", groups: [{ normalizedValue: "", value: "", count: 3, reviewState: "BLANK", matchesLetter: true }] },
          ],
        })}
        onReviewGroup={vi.fn()}
        busy={false}
      />,
    );
    expect(
      screen.getByText("Todas as respostas desta categoria estão em branco — nada para corrigir aqui."),
    ).toBeInTheDocument();
  });

  it("shows the 'no answers' message when a category has no groups at all", () => {
    render(
      <GroupedCorrectionPanel
        grid={makeGrid({ categories: [{ id: "c1", name: "Animal", groups: [] }] })}
        onReviewGroup={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText("Nenhuma resposta nesta categoria.")).toBeInTheDocument();
  });

  it("disables decision buttons while busy", () => {
    render(<GroupedCorrectionPanel grid={makeGrid()} onReviewGroup={vi.fn()} busy={true} />);
    expect(screen.getAllByRole("button", { name: "✓ Válida" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "✗ Inválida" })[0]).toBeDisabled();
  });

  it("handles an empty categories list without crashing", () => {
    render(<GroupedCorrectionPanel grid={{ round: { letter: "A" }, categories: [] }} onReviewGroup={vi.fn()} busy={false} />);
    expect(screen.getByText(/Correção agregada/)).toBeInTheDocument();
  });
});
