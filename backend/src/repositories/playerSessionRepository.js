import prisma from "../lib/prisma.js";

const studentSelect = { select: { id: true, name: true, registrationNumber: true } };

export const playerSessionRepository = {
  findByToken: (token) =>
    prisma.playerSession.findUnique({
      where: { token },
      include: { student: studentSelect, room: { include: { game: true } } },
    }),

  findById: (id) =>
    prisma.playerSession.findUnique({
      where: { id },
      include: { student: studentSelect, room: { include: { game: true } } },
    }),

  findByRoomAndStudent: (roomId, studentId) =>
    prisma.playerSession.findUnique({
      where: { roomId_studentId: { roomId, studentId } },
      include: { student: studentSelect },
    }),

  create: (data) =>
    prisma.playerSession.create({ data, include: { student: studentSelect } }),

  update: (id, data) =>
    prisma.playerSession.update({ where: { id }, data, include: { student: studentSelect } }),

  listByRoom: (roomId) =>
    prisma.playerSession.findMany({
      where: { roomId },
      include: { student: studentSelect },
      orderBy: { createdAt: "asc" },
    }),

  markConnected: (id, socketId) =>
    prisma.playerSession.update({
      where: { id },
      data: { socketId, connectedAt: new Date(), disconnectedAt: null },
    }),

  markDisconnected: (id) =>
    prisma.playerSession.update({
      where: { id },
      data: { socketId: null, disconnectedAt: new Date() },
    }),
};

export default playerSessionRepository;
