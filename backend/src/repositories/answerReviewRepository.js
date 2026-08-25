import prisma from "../lib/prisma.js";

export const answerReviewRepository = {
  createMany: (rows) => prisma.answerReview.createMany({ data: rows, skipDuplicates: true }),

  listByRound: (roundId) => prisma.answerReview.findMany({ where: { roundId } }),

  /** Mesma consulta, com a categoria/valor da resposta anexados — usado
   * para montar a lista anonima que o aluno ve (spec 10). */
  listByRoundWithAnswers: (roundId) =>
    prisma.answerReview.findMany({
      where: { roundId },
      include: { answer: { include: { roundCategory: true } } },
      orderBy: { id: "asc" },
    }),

  listByGrader: (roundId, graderPlayerSessionId) =>
    prisma.answerReview.findMany({
      where: { roundId, graderPlayerSessionId },
      include: { answer: { include: { roundCategory: true } } },
      orderBy: { id: "asc" },
    }),

  findById: (id) => prisma.answerReview.findUnique({ where: { id } }),

  /** So marca a decisao se ainda estava PENDING — impede reenvio (spec 37). */
  claimDecision: (id, decision) =>
    prisma.answerReview.updateMany({
      where: { id, decision: "PENDING" },
      data: { decision },
    }),

  countPendingByRound: (roundId) => prisma.answerReview.count({ where: { roundId, decision: "PENDING" } }),

  countByRound: (roundId) => prisma.answerReview.count({ where: { roundId } }),
};

export default answerReviewRepository;
