import prisma from "../lib/prisma.js";

const classSelect = { class: { select: { id: true, name: true, code: true } } };

export const studentRepository = {
  list: ({ classId, search } = {}) =>
    prisma.student.findMany({
      where: {
        ...(classId ? { enrollments: { some: { classId } } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { registrationNumber: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
      include: { enrollments: { include: classSelect } },
    }),

  findById: (id) =>
    prisma.student.findUnique({
      where: { id },
      include: { enrollments: { include: classSelect } },
    }),

  /** Consulta usada na identificacao por matricula (spec 6). */
  findByRegistration: (registrationNumber) =>
    prisma.student.findUnique({
      where: { registrationNumber },
      include: { enrollments: { include: classSelect } },
    }),

  /** `classIds` vira uma linha de Enrollment por turma (spec 17). */
  create: ({ classIds, ...data }) =>
    prisma.student.create({
      data: {
        ...data,
        enrollments: { create: classIds.map((classId) => ({ classId })) },
      },
      include: { enrollments: { include: classSelect } },
    }),

  /**
   * Quando `classIds` vem no payload, substitui o conjunto de turmas do
   * aluno (desmatricula quem saiu, matricula quem entrou) — nunca duplica
   * matriculas ja existentes (respeita a unicidade studentId+classId).
   */
  update: async (id, { classIds, ...data }) => {
    if (classIds) {
      await prisma.enrollment.deleteMany({ where: { studentId: id, classId: { notIn: classIds } } });
      await Promise.all(
        classIds.map((classId) =>
          prisma.enrollment.upsert({
            where: { studentId_classId: { studentId: id, classId } },
            update: {},
            create: { studentId: id, classId },
          }),
        ),
      );
    }
    return prisma.student.update({
      where: { id },
      data,
      include: { enrollments: { include: classSelect } },
    });
  },

  remove: (id) => prisma.student.delete({ where: { id } }),

  /**
   * `classId` unico para o lote inteiro (import de uma turma por vez).
   * Um aluno cuja matricula ja existe (de outra turma, por exemplo) nao e
   * duplicado nem tem o nome sobrescrito — so ganha a matricula nesta
   * turma, se ainda nao tiver. O id so existe depois do upsert do aluno,
   * entao a matricula na turma precisa de uma segunda operacao dentro da
   * mesma transacao interativa.
   */
  createMany: (classId, students) =>
    prisma.$transaction(async (tx) => {
      for (const student of students) {
        const created = await tx.student.upsert({
          where: { registrationNumber: student.registrationNumber },
          update: {},
          create: student,
        });
        await tx.enrollment.upsert({
          where: { studentId_classId: { studentId: created.id, classId } },
          update: {},
          create: { studentId: created.id, classId },
        });
      }
      return { count: students.length };
    }),

  /** Historico academico permanente do aluno (spec: avaliacao entre partidas). */
  gameHistory: (studentId) =>
    prisma.gameResult.findMany({
      where: { studentId },
      include: { game: { include: { class: { select: { name: true, discipline: true } } } } },
      orderBy: { game: { finishedAt: "desc" } },
    }),
};

export default studentRepository;
