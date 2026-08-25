import prisma from "../lib/prisma.js";

export const answerRepository = {
  upsert: ({ roundId, playerSessionId, roundCategoryId, value, normalizedValue }) =>
    prisma.answer.upsert({
      where: {
        roundId_playerSessionId_roundCategoryId: { roundId, playerSessionId, roundCategoryId },
      },
      update: { value, normalizedValue, submittedAt: new Date() },
      create: { roundId, playerSessionId, roundCategoryId, value, normalizedValue },
    }),

  findById: (id) =>
    prisma.answer.findUnique({
      where: { id },
      include: { round: true, roundCategory: true },
    }),

  listByRound: (roundId) =>
    prisma.answer.findMany({
      where: { roundId },
      include: {
        roundCategory: true,
        playerSession: {
          include: { student: { select: { id: true, name: true, registrationNumber: true } } },
        },
      },
      orderBy: [{ playerSessionId: "asc" }, { roundCategoryId: "asc" }],
    }),

  listByPlayer: (roundId, playerSessionId) =>
    prisma.answer.findMany({ where: { roundId, playerSessionId } }),

  countFilledByPlayer: (roundId, playerSessionId) =>
    prisma.answer.count({
      where: { roundId, playerSessionId, NOT: { normalizedValue: "" } },
    }),

  update: (id, data) => prisma.answer.update({ where: { id }, data }),
};

export default answerRepository;
