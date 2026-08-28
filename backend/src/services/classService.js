import classRepository from "../repositories/classRepository.js";
import { notFound } from "../lib/errors.js";

export const classService = {
  list: () => classRepository.list(),

  /** Uma turma pelo id; lance 404 quando nao existe. */
  async get(id) {
    const found = await classRepository.findById(id);
    if (!found) throw notFound("Turma não encontrada");
    return found;
  },

  create: (data) => classRepository.create(data),

  /** Atualiza uma turma existente. */
  async update(id, data) {
    await classService.get(id);
    return classRepository.update(id, data);
  },

  /** Remove uma turma existente. */
  async remove(id) {
    await classService.get(id);
    return classRepository.remove(id);
  },
};

export default classService;
