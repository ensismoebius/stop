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

export const reportService = { search };

export default reportService;
