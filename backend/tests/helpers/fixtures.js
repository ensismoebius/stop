import bcrypt from "bcryptjs";
import prisma from "../../src/lib/prisma.js";
import { clearAllTimers } from "../../src/game/timers.js";
import roomService from "../../src/services/roomService.js";
import roundService from "../../src/services/roundService.js";
import answerService from "../../src/services/answerService.js";

const TABLES = [
  "TelemetryEvent",
  "Answer",
  "RoundParticipant",
  "RoundCategory",
  "Round",
  "Score",
  "GameResult",
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

/** Todos os alunos do cenario entram na sala (helper compartilhado entre suites). */
export async function joinAllStudents(scenario) {
  const sessions = [];
  for (const student of scenario.students) {
    sessions.push(await roomService.join(scenario.room.code, student.registrationNumber));
  }
  return sessions;
}

/**
 * `roundService.start` so leva a rodada ate STARTING e devolve — o
 * cronometro so liga (status PLAYING) depois da sequencia de revelacao
 * (animacao + contagem regressiva), que roda em segundo plano (spec 4-7 e
 * 54). Em ambiente de teste essa sequencia esta configurada para duracao
 * ~0 (`env.letterRevealAnimationMs`/`countdownAckTimeoutMs`/
 * `countdownDurationMs`), mas ainda atravessa alguns ticks assincronos —
 * este helper espera o status desejado aparecer no banco, com timeout.
 */
export async function waitForRoundStatus(roundId, status, { timeoutMs = 2000, intervalMs = 5 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const round = await roundService.get(roundId);
    if (round.status === status) return round;
    if (Date.now() >= deadline) {
      throw new Error(`Rodada ${roundId} não chegou a ${status} a tempo (está em ${round.status})`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Cria, sorteia a letra e inicia uma rodada pronta para responder. */
export async function startedRound(scenario, { durationSeconds, letterRule } = {}) {
  const round = await roundService.create({
    gameId: scenario.game.id,
    categorySetId: scenario.categorySet.id,
    durationSeconds,
    letterRule,
  });
  await roundService.drawRoundLetter(round.id);
  await roundService.start(round.id);
  return waitForRoundStatus(round.id, "PLAYING");
}

/**
 * Preenche todas as categorias da rodada para um jogador.
 * `prefix`, quando informado, usa o nome da categoria (histórico do teste
 * de fluxo completo); sem `prefix`, usa `letra + id da categoria`.
 */
export async function fillAllAnswers(round, playerSessionId, { prefix } = {}) {
  for (const category of round.categories) {
    const value = prefix ? `${prefix}${category.name}` : `${round.letter}${category.id}`;
    await answerService.submit({ roundId: round.id, playerSessionId, roundCategoryId: category.id, value });
  }
}

export { prisma };
