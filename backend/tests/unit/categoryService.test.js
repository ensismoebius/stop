import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/categoryRepository.js", () => ({
  categorySetRepository: {
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
  },
  categoryRepository: {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

import { categoryRepository, categorySetRepository } from "../../src/repositories/categoryRepository.js";
import categoryService from "../../src/services/categoryService.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("services/categoryService (conjuntos de categorias)", () => {
  it("listSets repassa as opcoes", async () => {
    categorySetRepository.list.mockResolvedValue(["a"]);
    const result = await categoryService.listSets({ onlyActive: true });
    expect(categorySetRepository.list).toHaveBeenCalledWith({ onlyActive: true });
    expect(result).toEqual(["a"]);
  });

  it("getSet lanca 404 quando o conjunto nao existe", async () => {
    categorySetRepository.findById.mockResolvedValue(null);
    await expect(categoryService.getSet(999)).rejects.toMatchObject({ status: 404 });
  });

  it("getSet devolve o conjunto encontrado", async () => {
    categorySetRepository.findById.mockResolvedValue({ id: 1 });
    await expect(categoryService.getSet(1)).resolves.toEqual({ id: 1 });
  });

  it("createSet sem categorias nao inclui a chave categories", async () => {
    categorySetRepository.create.mockResolvedValue({ id: 1 });
    await categoryService.createSet({ name: "Set" });
    expect(categorySetRepository.create).toHaveBeenCalledWith({ name: "Set" });
  });

  it("createSet com categorias aplica os defaults (description/required/order)", async () => {
    categorySetRepository.create.mockResolvedValue({ id: 1 });
    await categoryService.createSet({
      name: "Set",
      categories: [
        { name: "Cat A" },
        { name: "Cat B", description: "desc", required: false, order: 5 },
      ],
    });
    expect(categorySetRepository.create).toHaveBeenCalledWith({
      name: "Set",
      categories: {
        create: [
          { name: "Cat A", description: null, required: true, order: 0 },
          { name: "Cat B", description: "desc", required: false, order: 5 },
        ],
      },
    });
  });

  it("updateSet sem categorias faz update simples", async () => {
    categorySetRepository.findById.mockResolvedValue({ id: 1 });
    categorySetRepository.update.mockResolvedValue({ id: 1, name: "Novo" });
    await categoryService.updateSet(1, { name: "Novo" });
    expect(categorySetRepository.update).toHaveBeenCalledWith(1, { name: "Novo" });
  });

  it("updateSet com categorias substitui o conjunto inteiro (deleteMany + create)", async () => {
    categorySetRepository.findById.mockResolvedValue({ id: 1 });
    categorySetRepository.update.mockResolvedValue({ id: 1 });
    await categoryService.updateSet(1, {
      name: "Novo",
      categories: [{ name: "Unica" }],
    });
    expect(categorySetRepository.update).toHaveBeenCalledWith(1, {
      name: "Novo",
      categories: {
        deleteMany: {},
        create: [{ name: "Unica", description: null, required: true, order: 0 }],
      },
    });
  });

  it("updateSet lanca 404 quando o conjunto nao existe", async () => {
    categorySetRepository.findById.mockResolvedValue(null);
    await expect(categoryService.updateSet(1, { name: "x" })).rejects.toMatchObject({ status: 404 });
  });

  it("removeSet verifica existencia antes de remover", async () => {
    categorySetRepository.findById.mockResolvedValue({ id: 1 });
    categorySetRepository.remove.mockResolvedValue(undefined);
    await categoryService.removeSet(1);
    expect(categorySetRepository.remove).toHaveBeenCalledWith(1);
  });

  it("removeSet lanca 404 quando o conjunto nao existe", async () => {
    categorySetRepository.findById.mockResolvedValue(null);
    await expect(categoryService.removeSet(1)).rejects.toMatchObject({ status: 404 });
  });

  it("listCategories repassa o categorySetId", async () => {
    categoryRepository.list.mockResolvedValue([]);
    await categoryService.listCategories(3);
    expect(categoryRepository.list).toHaveBeenCalledWith(3);
  });

  it("getCategory lanca 404 quando a categoria nao existe", async () => {
    categoryRepository.findById.mockResolvedValue(null);
    await expect(categoryService.getCategory(1)).rejects.toMatchObject({ status: 404 });
  });

  it("getCategory devolve a categoria encontrada", async () => {
    categoryRepository.findById.mockResolvedValue({ id: 1 });
    await expect(categoryService.getCategory(1)).resolves.toEqual({ id: 1 });
  });

  it("createCategory lanca 400 quando o conjunto informado nao existe", async () => {
    categorySetRepository.findById.mockResolvedValue(null);
    await expect(
      categoryService.createCategory({ categorySetId: 99, name: "x" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("createCategory cria quando o conjunto existe", async () => {
    categorySetRepository.findById.mockResolvedValue({ id: 1 });
    categoryRepository.create.mockResolvedValue({ id: 5 });
    const result = await categoryService.createCategory({ categorySetId: 1, name: "x" });
    expect(categoryRepository.create).toHaveBeenCalledWith({ categorySetId: 1, name: "x" });
    expect(result).toEqual({ id: 5 });
  });

  it("updateCategory lanca 404 quando a categoria nao existe", async () => {
    categoryRepository.findById.mockResolvedValue(null);
    await expect(categoryService.updateCategory(1, { name: "x" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("updateCategory sem trocar de conjunto nao valida categorySetId", async () => {
    categoryRepository.findById.mockResolvedValue({ id: 1 });
    categoryRepository.update.mockResolvedValue({ id: 1, name: "y" });
    await categoryService.updateCategory(1, { name: "y" });
    expect(categorySetRepository.findById).not.toHaveBeenCalled();
    expect(categoryRepository.update).toHaveBeenCalledWith(1, { name: "y" });
  });

  it("updateCategory trocando de conjunto valida o novo categorySetId", async () => {
    categoryRepository.findById.mockResolvedValue({ id: 1 });
    categorySetRepository.findById.mockResolvedValue(null);
    await expect(
      categoryService.updateCategory(1, { categorySetId: 42 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("updateCategory aceita a troca quando o novo conjunto existe", async () => {
    categoryRepository.findById.mockResolvedValue({ id: 1 });
    categorySetRepository.findById.mockResolvedValue({ id: 42 });
    categoryRepository.update.mockResolvedValue({ id: 1, categorySetId: 42 });
    await categoryService.updateCategory(1, { categorySetId: 42 });
    expect(categoryRepository.update).toHaveBeenCalledWith(1, { categorySetId: 42 });
  });

  it("removeCategory verifica existencia antes de remover", async () => {
    categoryRepository.findById.mockResolvedValue({ id: 1 });
    categoryRepository.remove.mockResolvedValue(undefined);
    await categoryService.removeCategory(1);
    expect(categoryRepository.remove).toHaveBeenCalledWith(1);
  });
});
