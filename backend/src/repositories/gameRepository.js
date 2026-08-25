import prisma from "../lib/prisma.js";

export const gameRepository = {
  list: ({ teacherId } = {}) =>
    prisma.game.findMany({
      where: teacherId ? { teacherId } : {},
      orderBy: { createdAt: "desc" },
      include: {
        class: { select: { id: true, name: true, code: true } },
        rooms: true,
        _count: { select: { rounds: true } },
      },
    }),

  findById: (id) =>
    prisma.game.findUnique({
      where: { id },
      include: {
        class: { select: { id: true, name: true, code: true } },
        rooms: true,
        rounds: {
          orderBy: { roundNumber: "asc" },
          include: { categories: { orderBy: { order: "asc" } } },
        },
      },
    }),

  create: (data) =>
    prisma.game.create({
      data,
      include: { class: { select: { id: true, name: true, code: true } } },
    }),

  update: (id, data) => prisma.game.update({ where: { id }, data }),

  /** Letras ja sorteadas na partida, para evitar repeticao (spec 16). */
  usedLetters: async (gameId) => {
    const rounds = await prisma.round.findMany({
      where: { gameId, NOT: { letter: "" } },
      select: { letter: true, roundNumber: true },
      orderBy: { roundNumber: "asc" },
    });
    return rounds.map((round) => round.letter);
  },

  lastRoundNumber: async (gameId) => {
    const round = await prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      select: { roundNumber: true },
    });
    return round?.roundNumber ?? 0;
  },
};

export default gameRepository;
