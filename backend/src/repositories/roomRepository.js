import prisma from "../lib/prisma.js";

const sessionInclude = {
  sessions: {
    include: {
      student: { select: { id: true, name: true, registrationNumber: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "asc" },
  },
};

export const roomRepository = {
  create: (data) => prisma.room.create({ data }),

  findByCode: (code) =>
    prisma.room.findUnique({
      where: { code },
      include: {
        game: { include: { class: { select: { id: true, name: true, code: true } } } },
        ...sessionInclude,
      },
    }),

  findById: (id) =>
    prisma.room.findUnique({
      where: { id },
      include: { game: true, ...sessionInclude },
    }),

  listByGame: (gameId) =>
    prisma.room.findMany({ where: { gameId }, orderBy: { createdAt: "desc" } }),

  update: (id, data) => prisma.room.update({ where: { id }, data }),
};

export default roomRepository;
