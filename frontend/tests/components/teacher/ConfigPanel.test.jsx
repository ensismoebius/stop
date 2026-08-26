import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfigPanel from "../../../src/components/teacher/ConfigPanel.jsx";

const classes = [
  { id: 1, name: "9A", code: "9A-M", discipline: "Biologia" },
  { id: 2, name: "9B", code: "9B-M", discipline: null },
];

const students = [
  {
    id: 100,
    registrationNumber: "111",
    name: "Ana",
    active: true,
    enrollments: [{ classId: 1, class: { code: "9A-M" } }],
  },
  {
    id: 101,
    registrationNumber: "222",
    name: "Beto",
    active: false,
    enrollments: [],
  },
];

function renderPanel(props = {}) {
  return render(
    <ConfigPanel
      classes={classes}
      students={students}
      selectedClassId={1}
      onSelectClass={vi.fn()}
      onCreateClass={vi.fn()}
      onUpdateClass={vi.fn()}
      onDeleteClass={vi.fn()}
      onCreateStudent={vi.fn()}
      onUpdateStudent={vi.fn()}
      onBulkStudents={vi.fn()}
      onDeleteStudent={vi.fn()}
      {...props}
    />,
  );
}

describe("ConfigPanel — Turmas", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a class with trimmed fields, discipline null when blank", async () => {
    const user = userEvent.setup();
    const onCreateClass = vi.fn();
    renderPanel({ onCreateClass });

    await user.type(screen.getByLabelText("Nome da turma"), "  9C  ");
    await user.type(screen.getByLabelText("Código da turma"), " 9C-M ");
    await user.click(screen.getAllByRole("button", { name: "Adicionar" })[0]);

    expect(onCreateClass).toHaveBeenCalledWith({ name: "9C", code: "9C-M", discipline: null });
  });

  it("creates a class with a discipline when provided", async () => {
    const user = userEvent.setup();
    const onCreateClass = vi.fn();
    renderPanel({ onCreateClass });

    await user.type(screen.getByLabelText("Nome da turma"), "9C");
    await user.type(screen.getByLabelText("Código da turma"), "9C-M");
    await user.type(screen.getByLabelText("Disciplina da turma"), "Física");
    await user.click(screen.getAllByRole("button", { name: "Adicionar" })[0]);

    expect(onCreateClass).toHaveBeenCalledWith({ name: "9C", code: "9C-M", discipline: "Física" });
  });

  it("hides the class table when there are no classes, but keeps the select", () => {
    renderPanel({ classes: [], students: [], selectedClassId: null });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Turma selecionada (para gerenciar os alunos abaixo)")).toBeInTheDocument();
  });

  it("shows '—' for a class with no discipline", () => {
    renderPanel();
    const row = screen.getByText("9B").closest("tr");
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("edits a class that has no discipline (nullish default for the field)", async () => {
    const user = userEvent.setup();
    const onUpdateClass = vi.fn();
    renderPanel({ onUpdateClass });

    const row = screen.getByText("9B").closest("tr");
    await user.click(within(row).getByRole("button", { name: "Editar" }));
    await user.type(screen.getByPlaceholderText("—"), "Química");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onUpdateClass).toHaveBeenCalledWith(2, { name: "9B", code: "9B-M", discipline: "Química" });
  });

  it("edits a class inline: save trims and nulls blank discipline", async () => {
    const user = userEvent.setup();
    const onUpdateClass = vi.fn();
    renderPanel({ onUpdateClass });

    const initialRow = screen.getByText("9A").closest("tr");
    await user.click(within(initialRow).getByRole("button", { name: "Editar" }));

    // Entering edit mode swaps in a whole new <tr> (ClassRowEditing, a
    // different component), so `initialRow` is now a detached DOM node —
    // query fresh from `screen` instead of re-scoping to it.
    const nameInput = screen.getByDisplayValue("9A");
    await user.clear(nameInput);
    await user.type(nameInput, " 9A-Novo ");
    const disciplineInput = screen.getByDisplayValue("Biologia");
    await user.clear(disciplineInput);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onUpdateClass).toHaveBeenCalledWith(1, { name: "9A-Novo", code: "9A-M", discipline: null });
  });

  it("cancels editing a class without saving", async () => {
    const user = userEvent.setup();
    const onUpdateClass = vi.fn();
    renderPanel({ onUpdateClass });

    const row = screen.getByText("9A").closest("tr");
    await user.click(within(row).getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onUpdateClass).not.toHaveBeenCalled();
    expect(screen.getByText("9A")).toBeInTheDocument();
  });

  it("deletes a class after confirmation, and skips when cancelled", async () => {
    const user = userEvent.setup();
    const onDeleteClass = vi.fn();
    renderPanel({ onDeleteClass });
    const row = screen.getByText("9A").closest("tr");

    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(within(row).getByRole("button", { name: "Remover" }));
    expect(onDeleteClass).not.toHaveBeenCalled();

    window.confirm.mockReturnValueOnce(true);
    await user.click(within(row).getByRole("button", { name: "Remover" }));
    expect(window.confirm).toHaveBeenLastCalledWith(
      'Remover a turma "9A"? Isso apaga também os alunos e o histórico de partidas dela.',
    );
    expect(onDeleteClass).toHaveBeenCalledWith(1);
  });

  it("selects a class from the dropdown, and null when blank chosen", async () => {
    const user = userEvent.setup();
    const onSelectClass = vi.fn();
    renderPanel({ onSelectClass, selectedClassId: null });

    const select = screen.getByLabelText("Turma selecionada (para gerenciar os alunos abaixo)");
    await user.selectOptions(select, "2");
    expect(onSelectClass).toHaveBeenCalledWith(2);

    await user.selectOptions(select, "");
    expect(onSelectClass).toHaveBeenCalledWith(null);
  });
});

describe("ConfigPanel — Alunos", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a placeholder when no class is selected", () => {
    renderPanel({ selectedClassId: null });
    expect(screen.getByText("Selecione uma turma para gerenciar os alunos.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Matrícula")).not.toBeInTheDocument();
  });

  it("creates a single student bound to the selected class", async () => {
    const user = userEvent.setup();
    const onCreateStudent = vi.fn();
    renderPanel({ onCreateStudent, selectedClassId: 2 });

    await user.type(screen.getByLabelText("Matrícula"), " 333 ");
    await user.type(screen.getByLabelText("Nome do aluno"), " Carla ");
    await user.click(screen.getAllByRole("button", { name: "Adicionar" })[1]);

    expect(onCreateStudent).toHaveBeenCalledWith({
      registrationNumber: "333",
      name: "Carla",
      classIds: [2],
    });
  });

  it("parses bulk student text (semicolon/comma/tab separators) and submits, disabled while empty", async () => {
    const user = userEvent.setup();
    const onBulkStudents = vi.fn();
    renderPanel({ onBulkStudents, selectedClassId: 1 });

    const button = () => screen.getByRole("button", { name: /Importar \d+ aluno\(s\)/ });
    expect(button()).toBeDisabled();

    const textarea = screen.getByLabelText("Importar em lote");
    await user.type(textarea, "111;Ana Silva\n222,Beto Souza\n\n   \n333\tCarla Dias");

    expect(screen.getByRole("button", { name: "Importar 3 aluno(s)" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Importar 3 aluno(s)" }));

    expect(onBulkStudents).toHaveBeenCalledWith({
      classId: 1,
      students: [
        { registrationNumber: "111", name: "Ana Silva" },
        { registrationNumber: "222", name: "Beto Souza" },
        { registrationNumber: "333", name: "Carla Dias" },
      ],
    });
    expect(textarea).toHaveValue("");
  });

  it("drops bulk lines missing a registration number or a name", async () => {
    const user = userEvent.setup();
    renderPanel({ selectedClassId: 1 });
    await user.type(screen.getByLabelText("Importar em lote"), "111;\n;SemMatricula\n444;Diego");
    expect(screen.getByRole("button", { name: "Importar 1 aluno(s)" })).toBeInTheDocument();
  });

  it("shows turma codes joined, or '—' when unenrolled, and active/inactive status", () => {
    renderPanel();
    const anaRow = screen.getByText("Ana").closest("tr");
    expect(within(anaRow).getByText("9A-M")).toBeInTheDocument();
    expect(within(anaRow).getByText("Ativo")).toBeInTheDocument();

    const betoRow = screen.getByText("Beto").closest("tr");
    expect(within(betoRow).getByText("—")).toBeInTheDocument();
    expect(within(betoRow).getByText("Inativo")).toBeInTheDocument();
  });

  it("falls back to raw classId when an enrollment has no populated class", () => {
    renderPanel({
      students: [
        { id: 200, registrationNumber: "9", name: "Zeca", active: true, enrollments: [{ classId: 5 }] },
      ],
    });
    const row = screen.getByText("Zeca").closest("tr");
    expect(within(row).getByText("5")).toBeInTheDocument();
  });

  it("treats a missing enrollments array as no enrollments, in both display and edit mode", async () => {
    const user = userEvent.setup();
    renderPanel({
      students: [{ id: 300, registrationNumber: "7", name: "Ioná", active: true }],
    });
    const row = screen.getByText("Ioná").closest("tr");
    expect(within(row).getByText("—")).toBeInTheDocument();

    await user.click(within(row).getByRole("button", { name: "Editar" }));
    // No class checkbox is pre-checked, so Salvar starts out disabled.
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("edits a student inline, toggling class enrollment and the active flag", async () => {
    const user = userEvent.setup();
    const onUpdateStudent = vi.fn();
    renderPanel({ onUpdateStudent });

    const initialRow = screen.getByText("Ana").closest("tr");
    await user.click(within(initialRow).getByRole("button", { name: "Editar" }));

    // Entering edit mode swaps Ana's <tr> for a different component
    // (StudentRowEditing), detaching `initialRow` — query fresh from
    // `screen` from here on (Beto's row, untouched, has no checkboxes or
    // Salvar/Cancelar buttons, so these stay unambiguous).
    const nameInput = screen.getByDisplayValue("Ana");
    await user.clear(nameInput);
    await user.type(nameInput, "Ana Paula");

    // Add class 2 on top of the already-enrolled class 1, and flip active off.
    await user.click(screen.getByLabelText("9B (9B-M)"));
    await user.click(screen.getByLabelText("Ativo"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onUpdateStudent).toHaveBeenCalledWith(100, {
      registrationNumber: "111",
      name: "Ana Paula",
      active: false,
      classIds: [1, 2],
    });
  });

  it("disables save when a student has no classes checked", async () => {
    const user = userEvent.setup();
    renderPanel();
    const row = screen.getByText("Ana").closest("tr");
    await user.click(within(row).getByRole("button", { name: "Editar" }));

    // Uncheck the only enrolled class (9A).
    const classCheckbox = screen.getByLabelText("9A (9A-M)");
    await user.click(classCheckbox);

    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("cancels editing a student without saving", async () => {
    const user = userEvent.setup();
    const onUpdateStudent = vi.fn();
    renderPanel({ onUpdateStudent });
    const row = screen.getByText("Ana").closest("tr");
    await user.click(within(row).getByRole("button", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onUpdateStudent).not.toHaveBeenCalled();
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it("deletes a student without a confirmation prompt", async () => {
    const user = userEvent.setup();
    const onDeleteStudent = vi.fn();
    renderPanel({ onDeleteStudent });
    const row = screen.getByText("Ana").closest("tr");
    await user.click(within(row).getByRole("button", { name: "Remover" }));
    expect(onDeleteStudent).toHaveBeenCalledWith(100);
  });
});
