import prisma from "../lib/prisma.js";

export const scoreRepository = {
  listByGame: (gameId) =>
    prisma.score.findMany({
      where: { gameId },
      include: {
        student: { select: { id: true, name: true, registrationNumber: true, avatarUrl: true } },
      },
      orderBy: { total: "desc" },
    }),

  ensure: (gameId, studentId) =>
    prisma.score.upsert({
      where: { gameId_studentId: { gameId, studentId } },
      update: {},
      create: { gameId, studentId, total: 0 },
    }),

};

export default scoreRepository;
