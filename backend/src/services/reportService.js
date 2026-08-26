import prisma from "../lib/prisma.js";

/**
 * Relatorio academico entre partidas/turmas — le de `GameResult`, gravado
 * quando o professor finaliza uma partida (gameService.finish). Todos os
 * filtros sao opcionais; o resultado sempre vem ordenado por nome do
 * aluno, independente de quais filtros foram usados.
 */
async function search({
  discipline,
  classId,
  studentId,
  gameId,
  medal,
  dateFrom,
  dateTo,
  scoreMin,
  scoreMax,
} = {}) {
  return prisma.gameResult.findMany({
    where: {
      medal: medal || undefined,
      studentId: studentId || undefined,
      gameId: gameId || undefined,
      score: {
        gte: scoreMin ?? undefined,
        lte: scoreMax ?? undefined,
      },
      game: {
        classId: classId || undefined,
        finishedAt: {
          gte: dateFrom ?? undefined,
          lte: dateTo ?? undefined,
        },
        class: discipline ? { discipline } : undefined,
      },
    },
    include: {
      student: { select: { id: true, name: true, registrationNumber: true } },
      game: { include: { class: { select: { id: true, name: true, code: true, discipline: true } } } },
    },
    orderBy: { student: { name: "asc" } },
  });
}

/**
 * Desempenho por categoria (nome copiado em `RoundCategory` no momento da
 * criação da rodada, spec 17 — por isso continua estável entre partidas
 * diferentes que reusam o mesmo `CategorySet`). Ordenado por taxa de
 * acerto crescente: a categoria em que a turma mais erra aparece primeiro,
 * é o dado mais acionável para o professor.
 */
async function categoryStats({ discipline, classId, gameId } = {}) {
  const answers = await prisma.answer.findMany({
    where: {
      round: {
        game: {
          id: gameId || undefined,
          classId: classId || undefined,
          class: discipline ? { discipline } : undefined,
        },
      },
    },
    select: { normalizedValue: true, score: true, roundCategory: { select: { name: true } } },
  });

  const byCategory = new Map();
  for (const answer of answers) {
    const key = answer.roundCategory.name;
    const entry = byCategory.get(key) ?? { category: key, answers: 0, filled: 0, valid: 0, invalid: 0 };
    entry.answers += 1;
    if (answer.normalizedValue) {
      entry.filled += 1;
      if (answer.score > 0) entry.valid += 1;
      else entry.invalid += 1;
    }
    byCategory.set(key, entry);
  }

  return [...byCategory.values()]
    .map((entry) => ({
      ...entry,
      fillRate: entry.answers === 0 ? 0 : Number((entry.filled / entry.answers).toFixed(3)),
      accuracyRate: entry.filled === 0 ? 0 : Number((entry.valid / entry.filled).toFixed(3)),
    }))
    .sort((a, b) => a.accuracyRate - b.accuracyRate || a.category.localeCompare(b.category, "pt-BR"));
}

export const reportService = { search, categoryStats };

export default reportService;
