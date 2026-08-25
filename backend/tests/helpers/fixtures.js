import bcrypt from "bcryptjs";
import prisma from "../../src/lib/prisma.js";
import { clearAllTimers } from "../../src/game/timers.js";

const TABLES = [
  "TelemetryEvent",
  "Answer",
  "RoundParticipant",
  "RoundCategory",
  "Round",
  "Score",
  "PlayerSession",
  "Room",
  "Game",
  "Category",
  "CategorySet",
  "Enrollment",
  "Student",
  "Class",
  "Teacher",
];

/**
 * Zera o banco de testes preservando o schema.
 * Usa DELETE na ordem filho -> pai (em vez de TRUNCATE) para respeitar as
 * chaves estrangeiras e rodar tudo na mesma conexao.
 */
export async function resetDatabase() {
  clearAllTimers();
  await prisma.$transaction(
    TABLES.map((table) => prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``)),
  );
}

export async function createTeacher({ email = "professor@stop.local", password = "stop-admin" } = {}) {
  return prisma.teacher.create({
    data: {
      email,
      name: "Professor",
      passwordHash: await bcrypt.hash(password, 10),
      role: "TEACHER",
    },
  });
}

export async function createClassWithStudents(names = ["Joao da Silva", "Maria Oliveira", "Pedro Santos"]) {
  const turma = await prisma.class.create({ data: { name: "React Native 2026/1", code: "RN-TEST" } });
  const students = [];
  for (const [index, name] of names.entries()) {
    students.push(
      await prisma.student.create({
        data: {
          name,
          registrationNumber: `20261000${index}`,
          enrollments: { create: { classId: turma.id } },
        },
      }),
    );
  }
  return { turma, students };
}

export async function createCategorySet({
  name = "React Native — Componentes",
  categories = ["Componente", "Prop", "Evento"],
} = {}) {
  return prisma.categorySet.create({
    data: {
      name,
      categories: {
        create: categories.map((category, index) => ({ name: category, required: true, order: index })),
      },
    },
    include: { categories: { orderBy: { order: "asc" } } },
  });
}

/** Monta um cenario completo: professor, turma, alunos, partida e sala. */
export async function createScenario(options = {}) {
  const teacher = await createTeacher(options.teacher);
  const { turma, students } = await createClassWithStudents(options.students);
  const categorySet = await createCategorySet(options.categorySet);
  const game = await prisma.game.create({
    data: { name: "Revisao React Native", classId: turma.id, teacherId: teacher.id },
  });
  const room = await prisma.room.create({ data: { gameId: game.id, code: "STOP-TEST" } });
  return { teacher, turma, students, categorySet, game, room };
}

export { prisma };
