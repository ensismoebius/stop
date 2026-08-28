import { categoryRepository, categorySetRepository } from "../repositories/categoryRepository.js";
import { badRequest, notFound } from "../lib/errors.js";

export const categoryService = {
  listSets: (options) => categorySetRepository.list(options),

  /** Um conjunto de categorias pelo id; lance 404 quando nao existe. */
  async getSet(id) {
    const set = await categorySetRepository.findById(id);
    if (!set) throw notFound("Conjunto de categorias não encontrado");
    return set;
  },

  /** Cria um conjunto de categorias com suas categorias aninhadas. */
  createSet({ categories, ...data }) {
    return categorySetRepository.create({
      ...data,
      ...(categories
        ? {
            categories: {
              create: categories.map((category, index) => ({
                name: category.name,
                description: category.description ?? null,
                required: category.required ?? true,
                order: category.order ?? index,
              })),
            },
          }
        : {}),
    });
  },

  /** Substitui um conjunto inteiro; rodadas ja criadas mantem a copia das categorias. */
  async updateSet(id, { categories, ...data }) {
    await categoryService.getSet(id);
    if (categories) {
      // Substituicao completa do conjunto. Rodadas ja criadas mantem a
      // copia das categorias e nao sao afetadas (spec 17).
      return categorySetRepository.update(id, {
        ...data,
        categories: {
          deleteMany: {},
          create: categories.map((category, index) => ({
            name: category.name,
            description: category.description ?? null,
            required: category.required ?? true,
            order: category.order ?? index,
          })),
        },
      });
    }
    return categorySetRepository.update(id, data);
  },

  /** Remove um conjunto de categorias (e as categorias filhas). */
  async removeSet(id) {
    await categoryService.getSet(id);
    return categorySetRepository.remove(id);
  },

  listCategories: (categorySetId) => categoryRepository.list(categorySetId),

  /** Uma categoria pelo id; lance 404 quando nao existe. */
  async getCategory(id) {
    const category = await categoryRepository.findById(id);
    if (!category) throw notFound("Categoria não encontrada");
    return category;
  },

  /** Cria uma categoria dentro de um conjunto existente. */
  async createCategory(data) {
    const set = await categorySetRepository.findById(data.categorySetId);
    if (!set) throw badRequest("Conjunto de categorias inexistente");
    return categoryRepository.create(data);
  },

  /** Atualiza uma categoria, validando o conjunto quando ele muda. */
  async updateCategory(id, data) {
    await categoryService.getCategory(id);
    if (data.categorySetId) {
      const set = await categorySetRepository.findById(data.categorySetId);
      if (!set) throw badRequest("Conjunto de categorias inexistente");
    }
    return categoryRepository.update(id, data);
  },

  /** Remove uma categoria isolada. */
  async removeCategory(id) {
    await categoryService.getCategory(id);
    return categoryRepository.remove(id);
  },
};

export default categoryService;
