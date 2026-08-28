import prisma from "../lib/prisma.js";
import { retryOnWriteConflict } from "../lib/retry.js";

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

  /** Posição `(roomEpoch, stateVersion)` corrente da sala (não incrementa). */
  getVersion: (id) =>
    prisma.room
      .findUnique({ where: { id }, select: { roomEpoch: true, stateVersion: true } })
      .then((room) => ({ roomEpoch: room?.roomEpoch ?? 1, stateVersion: room?.stateVersion ?? 0 })),

  /**
   * Incrementa `stateVersion` de forma atômica e devolve a nova posição.
   * Dentro de uma transação, o UPDATE com increment tem precedência sobre
   * leituras concorrentes (bloqueio de linha em MySQL) e o SELECT devolve o
   * valor já-incrementado — em difusões concorrentes cada uma vê um número
   * distinto e monotônico. Sob rajadas (turma inteira entrando/respondendo
   * junto, cada difusão bumpa) o MySQL pode responder 1020 na linha da sala;
   * o retry curto resolve porque a outra transação já comitou o increment.
   */
  bumpStateVersion: (id) =>
    retryOnWriteConflict(() =>
      prisma.$transaction(async (tx) => {
        const room = await tx.room.update({
          where: { id },
          data: { stateVersion: { increment: 1 } },
          select: { roomEpoch: true, stateVersion: true },
        });
        return { roomEpoch: room.roomEpoch, stateVersion: room.stateVersion };
      }),
    ),
};

export default roomRepository;
