import classRepository from "../repositories/classRepository.js";
import { notFound } from "../lib/errors.js";

export const classService = {
  list: () => classRepository.list(),

  async get(id) {
    const found = await classRepository.findById(id);
    if (!found) throw notFound("Turma não encontrada");
    return found;
  },

  create: (data) => classRepository.create(data),

  async update(id, data) {
    await classService.get(id);
    return classRepository.update(id, data);
  },

  async remove(id) {
    await classService.get(id);
    return classRepository.remove(id);
  },
};

export default classService;
