import studentRepository from "../repositories/studentRepository.js";
import classRepository from "../repositories/classRepository.js";
import { badRequest, notFound } from "../lib/errors.js";

async function assertClassesExist(classIds) {
  const found = await classRepository.findByIds(classIds);
  const foundIds = new Set(found.map((turma) => turma.id));
  const missing = classIds.filter((classId) => !foundIds.has(classId));
  if (missing.length > 0) throw badRequest(`Turma inexistente: ${missing[0]}`);
}

export const studentService = {
  list: (filters) => studentRepository.list(filters),

  async get(id) {
    const student = await studentRepository.findById(id);
    if (!student) throw notFound("Aluno não encontrado");
    return student;
  },

  /**
   * Identificacao por matricula (spec 6). O nome vem exclusivamente do
   * banco: o cliente nunca envia o proprio nome como identificacao.
   */
  async findByRegistration(registrationNumber) {
    const student = await studentRepository.findByRegistration(registrationNumber.trim());
    if (!student || !student.active) return null;
    return student;
  },

  /** Um aluno pode cursar mais de uma turma (spec 17): confere pela lista de matriculas. */
  belongsToClass(student, classId) {
    return (student.enrollments ?? []).some((enrollment) => enrollment.classId === classId);
  },

  async create(data) {
    await assertClassesExist(data.classIds);
    return studentRepository.create(data);
  },

  async update(id, data) {
    await studentService.get(id);
    if (data.classIds) await assertClassesExist(data.classIds);
    return studentRepository.update(id, data);
  },

  async remove(id) {
    await studentService.get(id);
    return studentRepository.remove(id);
  },

  async bulkCreate({ classId, students }) {
    const turma = await classRepository.findById(classId);
    if (!turma) throw badRequest("Turma inexistente");
    const result = await studentRepository.createMany(classId, students);
    return { created: result.count };
  },

  /**
   * Historico do proprio aluno, por matricula (mesmo modelo de confianca
   * do identify de sala, spec 6: so a matricula, sem senha). Publico por
   * desenho — nao exige token de professor nem sessao de sala.
   */
  async historyByRegistration(registrationNumber) {
    const student = await studentService.findByRegistration(registrationNumber);
    if (!student) throw notFound("Matrícula não encontrada. Verifique o número informado.");
    const results = await studentRepository.gameHistory(student.id);
    return {
      student: { name: student.name, registrationNumber: student.registrationNumber },
      results: results.map((result) => ({
        id: result.id,
        gameName: result.game.name,
        discipline: result.game.class?.discipline ?? null,
        className: result.game.class?.name ?? null,
        finishedAt: result.game.finishedAt,
        score: result.score,
        position: result.position,
        medal: result.medal,
      })),
    };
  },
};

export default studentService;
