import prisma from "../lib/prisma.js";
import { retryOnWriteConflict } from "../lib/retry.js";

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

  /**
   * Todas as transições de conexão disputam a MESMA linha da sessão quando o
   * mesmo aluno tem sockets sobrepostos (reconexão, duas abas). Sob essa
   * corrida o MySQL responde 1020 — um retry curto resolve porque a outra
   * transação já comitou. `markConnected` é last-write-wins: o socket mais
   * recente assume a sessão.
   */
  update: (id, data) =>
    retryOnWriteConflict(() =>
      prisma.playerSession.update({ where: { id }, data, include: { student: studentSelect } }),
    ),

  listByRoom: (roomId) =>
    prisma.playerSession.findMany({
      where: { roomId },
      include: { student: studentSelect },
      orderBy: { createdAt: "asc" },
    }),

  markConnected: (id, socketId) =>
    retryOnWriteConflict(() =>
      prisma.playerSession.update({
        where: { id },
        data: { socketId, connectedAt: new Date(), disconnectedAt: null },
      }),
    ),

  /**
   * Só limpa o socketId se ainda pertence a ESTE socket: quando um socket
   * antigo desconecta depois do reconnect já ter assumido a sessão, a
   * atualização não deve derrubar a conexão nova. E o `updateMany` evita o
   * read-then-write da transação (a própria origem do 1020).
   */
  markDisconnected: (id, socketId) =>
    retryOnWriteConflict(() =>
      prisma.playerSession.updateMany({
        where: { id, socketId },
        data: { socketId: null, disconnectedAt: new Date() },
      }),
    ),
};

export default playerSessionRepository;
