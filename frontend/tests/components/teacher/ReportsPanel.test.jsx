import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportsPanel from "../../../src/components/teacher/ReportsPanel.jsx";

const classes = [
  { id: 1, name: "9A", code: "9A-M", discipline: "Biologia" },
  { id: 2, name: "9B", code: "9B-M", discipline: "Biologia" },
  { id: 3, name: "8A", code: "8A-M", discipline: null },
];
const students = [
  { id: 10, name: "Ana" },
  { id: 11, name: "Beto" },
];
const games = [{ id: 100, name: "Jogo 1" }];

const results = [
  {
    id: "r1",
    student: { name: "Ana", registrationNumber: "111" },
    game: { name: "Jogo 1", finishedAt: "2026-01-10T12:00:00Z", class: { name: "9A", discipline: "Biologia" } },
    position: 1,
    score: 42,
    medal: "GOLD",
  },
  {
    id: "r2",
    student: { name: "Beto", registrationNumber: "222" },
    game: { name: "Jogo 2", finishedAt: null, class: { name: "9B", discipline: null } },
    position: 3,
    score: 7,
    medal: null,
  },
];

function renderPanel(props = {}) {
  return render(
    <ReportsPanel
      classes={classes}
      students={students}
      games={games}
      results={[]}
      onSearch={vi.fn()}
      categoryStats={null}
      onCategoryStats={vi.fn()}
      busy={false}
      {...props}
    />,
  );
}

describe("ReportsPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("collects every filter field and calls onSearch on submit", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    renderPanel({ onSearch });

    await user.selectOptions(screen.getByLabelText("Disciplina"), "Biologia");
    await user.selectOptions(screen.getByLabelText("Turma"), "2");
    await user.selectOptions(screen.getByLabelText("Aluno"), "10");
    await user.selectOptions(screen.getByLabelText("Partida"), "100");
    await user.selectOptions(screen.getByLabelText("Medalha"), "GOLD");
    // Date inputs: fireEvent-friendly via userEvent.type after clearing default.
    await user.type(screen.getByLabelText("De"), "2026-01-01");
    await user.type(screen.getByLabelText("Até"), "2026-01-31");
    await user.type(screen.getByLabelText("Pontuação mínima"), "5");
    await user.type(screen.getByLabelText("Pontuação máxima"), "50");

    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(onSearch).toHaveBeenCalledWith({
      discipline: "Biologia",
      classId: "2",
      studentId: "10",
      gameId: "100",
      medal: "GOLD",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      scoreMin: "5",
      scoreMax: "50",
    });
  });

  it("deduplicates disciplines and drops falsy ones from the filter options", () => {
    renderPanel();
    const select = screen.getByLabelText("Disciplina");
    const options = within(select).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Todas", "Biologia"]);
  });

  it("disables Buscar and Desempenho por categoria while busy", () => {
    renderPanel({ busy: true });
    expect(screen.getByRole("button", { name: "Buscar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Desempenho por categoria" })).toBeDisabled();
  });

  it("calls onCategoryStats with the discipline/class/game filters only", async () => {
    const user = userEvent.setup();
    const onCategoryStats = vi.fn();
    renderPanel({ onCategoryStats });

    await user.selectOptions(screen.getByLabelText("Turma"), "1");
    await user.click(screen.getByRole("button", { name: "Desempenho por categoria" }));

    expect(onCategoryStats).toHaveBeenCalledWith({ discipline: "", classId: "1", gameId: "" });
  });

  it("disables Exportar CSV when there are no results, enables otherwise", () => {
    const { rerender } = renderPanel({ results: [] });
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();

    rerender(
      <ReportsPanel
        classes={classes}
        students={students}
        games={games}
        results={results}
        onSearch={vi.fn()}
        categoryStats={null}
        onCategoryStats={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Exportar CSV" })).not.toBeDisabled();
  });

  it("builds and downloads a CSV blob from the current results", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const resultWithMissingStudent = { id: "r3", game: null, position: 9, score: 0, medal: null };
    renderPanel({ results: [...results, resultWithMissingStudent] });
    await user.click(screen.getByRole("button", { name: "Exportar CSV" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("text/csv;charset=utf-8;");
    const text = await blob.text();
    expect(text).toContain('"Aluno","Matrícula","Disciplina","Turma","Partida","Data","Posição","Pontos","Medalha"');
    expect(text).toContain('"Ana","111","Biologia","9A","Jogo 1"');
    expect(text).toContain("🥇 Ouro");
    // Beto: no discipline, no finishedAt, no medal -> "—" placeholders.
    expect(text).toContain('"Beto","222","—","9B","Jogo 2","—","3º","7","—"');
    // Missing student/game entirely -> undefined fields collapse to "" via `?? ""`.
    expect(text).toContain('"","","—","","","—","9º","0","—"');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("renders an empty-state row when there are no results", () => {
    renderPanel({ results: [] });
    expect(screen.getByText("Nenhum resultado para os filtros selecionados.")).toBeInTheDocument();
  });

  it("renders result rows with placeholders for missing discipline/date/medal", () => {
    renderPanel({ results });
    const anaRow = screen.getByRole("cell", { name: "Ana" }).closest("tr");
    expect(within(anaRow).getByText("111")).toBeInTheDocument();
    expect(within(anaRow).getByText("Biologia")).toBeInTheDocument();
    expect(within(anaRow).getByText("1º")).toBeInTheDocument();
    expect(within(anaRow).getByText("🥇 Ouro")).toBeInTheDocument();

    const betoRow = screen.getByRole("cell", { name: "Beto" }).closest("tr");
    expect(within(betoRow).getAllByText("—")).toHaveLength(3); // discipline, date, medal
  });

  it("hides the category-stats table entirely when categoryStats is null", () => {
    renderPanel({ categoryStats: null });
    expect(screen.queryByRole("heading", { name: "Desempenho por categoria" })).not.toBeInTheDocument();
  });

  it("shows an empty-state row for an empty categoryStats array", () => {
    renderPanel({ categoryStats: [] });
    expect(screen.getByText("Nenhum dado para os filtros selecionados.")).toBeInTheDocument();
  });

  it("renders category stats rows with rounded percentages", () => {
    renderPanel({
      categoryStats: [
        { category: "Animais", answers: 20, filled: 18, valid: 15, fillRate: 0.9, accuracyRate: 0.8333 },
      ],
    });
    expect(screen.getByText("Animais")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.getByText("83%")).toBeInTheDocument();
  });
});
