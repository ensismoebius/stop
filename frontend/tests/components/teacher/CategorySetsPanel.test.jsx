import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategorySetsPanel from "../../../src/components/teacher/CategorySetsPanel.jsx";

const baseSet = {
  id: 1,
  name: "Biologia",
  categories: [
    { id: 10, name: "Animal", required: true },
    { id: 11, name: "Planta", required: false },
  ],
};

function renderPanel(props = {}) {
  return render(
    <CategorySetsPanel
      categorySets={[baseSet]}
      onCreateCategorySet={vi.fn()}
      onUpdateCategorySet={vi.fn()}
      onDeleteCategorySet={vi.fn()}
      onCreateCategory={vi.fn()}
      onUpdateCategory={vi.fn()}
      onDeleteCategory={vi.fn()}
      {...props}
    />,
  );
}

describe("CategorySetsPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a category set from newline-separated categories, trimmed", async () => {
    const user = userEvent.setup();
    const onCreateCategorySet = vi.fn();
    renderPanel({ onCreateCategorySet });

    await user.type(screen.getByLabelText("Nome do conjunto"), "  Química  ");
    await user.type(screen.getByLabelText("Categorias"), "Elemento\n  Composto  \n\nReação");
    await user.click(screen.getByRole("button", { name: "Criar conjunto" }));

    expect(onCreateCategorySet).toHaveBeenCalledWith({
      name: "Química",
      categories: [
        { name: "Elemento", order: 0, required: true },
        { name: "Composto", order: 1, required: true },
        { name: "Reação", order: 2, required: true },
      ],
    });
    expect(screen.getByLabelText("Nome do conjunto")).toHaveValue("");
  });

  it("does not submit when all category lines are blank", async () => {
    const user = userEvent.setup();
    const onCreateCategorySet = vi.fn();
    renderPanel({ onCreateCategorySet });

    await user.type(screen.getByLabelText("Nome do conjunto"), "Vazio");
    await user.type(screen.getByLabelText("Categorias"), "   \n  ");
    await user.click(screen.getByRole("button", { name: "Criar conjunto" }));

    expect(onCreateCategorySet).not.toHaveBeenCalled();
  });

  it("marks optional categories and supports editing a set's name", async () => {
    const user = userEvent.setup();
    const onUpdateCategorySet = vi.fn();
    renderPanel({ onUpdateCategorySet });

    expect(screen.getByText("(opcional)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar nome" }));
    const nameInput = screen.getByDisplayValue("Biologia");
    await user.clear(nameInput);
    await user.type(nameInput, "  Biologia II  ");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onUpdateCategorySet).toHaveBeenCalledWith(1, { name: "Biologia II" });
    expect(screen.getByText("Biologia")).toBeInTheDocument(); // reverted to strong display using prop (unchanged prop)
  });

  it("cancels editing a set's name without calling onUpdateSet", async () => {
    const user = userEvent.setup();
    const onUpdateCategorySet = vi.fn();
    renderPanel({ onUpdateCategorySet });

    await user.click(screen.getByRole("button", { name: "Editar nome" }));
    const nameInput = screen.getByDisplayValue("Biologia");
    await user.clear(nameInput);
    await user.type(nameInput, "X");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onUpdateCategorySet).not.toHaveBeenCalled();
    expect(screen.getByText("Biologia")).toBeInTheDocument();
  });

  it("deletes a set after confirmation, and skips when cancelled", async () => {
    const user = userEvent.setup();
    const onDeleteCategorySet = vi.fn();
    renderPanel({ onDeleteCategorySet });

    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Remover conjunto" }));
    expect(onDeleteCategorySet).not.toHaveBeenCalled();

    window.confirm.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Remover conjunto" }));
    expect(window.confirm).toHaveBeenLastCalledWith(
      'Remover o conjunto "Biologia" e todas as suas categorias?',
    );
    expect(onDeleteCategorySet).toHaveBeenCalledWith(1);
  });

  it("edits a category (save) and updates required flag", async () => {
    const user = userEvent.setup();
    const onUpdateCategory = vi.fn();
    renderPanel({ onUpdateCategory });

    const animalRow = screen.getByText("Animal").closest(".row");
    await user.click(within(animalRow).getByRole("button", { name: "Editar" }));

    const input = screen.getByDisplayValue("Animal");
    await user.clear(input);
    await user.type(input, "  Mamífero  ");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onUpdateCategory).toHaveBeenCalledWith(10, { name: "Mamífero", required: false });
  });

  it("cancels editing a category, reverting local state", async () => {
    const user = userEvent.setup();
    const onUpdateCategory = vi.fn();
    renderPanel({ onUpdateCategory });

    const animalRow = screen.getByText("Animal").closest(".row");
    await user.click(within(animalRow).getByRole("button", { name: "Editar" }));
    const input = screen.getByDisplayValue("Animal");
    await user.clear(input);
    await user.type(input, "Outro");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onUpdateCategory).not.toHaveBeenCalled();
    expect(screen.getByText("Animal")).toBeInTheDocument();
  });

  it("deletes a category", async () => {
    const user = userEvent.setup();
    const onDeleteCategory = vi.fn();
    renderPanel({ onDeleteCategory });

    const plantaRow = screen.getByText("Planta").closest(".row");
    await user.click(within(plantaRow).getByRole("button", { name: "Remover" }));

    expect(onDeleteCategory).toHaveBeenCalledWith(11);
  });

  it("adds a new category to a set, trimmed, with the correct order", async () => {
    const user = userEvent.setup();
    const onCreateCategory = vi.fn();
    renderPanel({ onCreateCategory });

    const input = screen.getByLabelText("Nova categoria para Biologia");
    await user.type(input, "  Fungo  ");
    await user.click(screen.getByRole("button", { name: "+ categoria" }));

    expect(onCreateCategory).toHaveBeenCalledWith({
      categorySetId: 1,
      name: "Fungo",
      order: 2,
      required: true,
    });
    expect(input).toHaveValue("");
  });

  it("does not add a blank category", async () => {
    const user = userEvent.setup();
    const onCreateCategory = vi.fn();
    renderPanel({ onCreateCategory });

    await user.click(screen.getByRole("button", { name: "+ categoria" }));
    expect(onCreateCategory).not.toHaveBeenCalled();
  });

  it("handles a set with no categories array, including adding the first category", async () => {
    const user = userEvent.setup();
    const onCreateCategory = vi.fn();
    renderPanel({ categorySets: [{ id: 2, name: "Vazio" }], onCreateCategory });
    expect(screen.getByText("Vazio")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nova categoria para Vazio"), "Primeira");
    await user.click(screen.getByRole("button", { name: "+ categoria" }));

    expect(onCreateCategory).toHaveBeenCalledWith({
      categorySetId: 2,
      name: "Primeira",
      order: 0,
      required: true,
    });
  });
});
