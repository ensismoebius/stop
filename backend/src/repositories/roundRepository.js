import prisma from "../lib/prisma.js";

const roundInclude = {
  categories: { orderBy: { order: "asc" } },
  firstStopper: { include: { student: { select: { id: true, name: true } } } },
};

export const roundRepository = {
  create: (data) => prisma.round.create({ data, include: roundInclude }),

  findById: (id) => prisma.round.findUnique({ where: { id }, include: roundInclude }),

  findCurrentByGame: (gameId) =>
    prisma.round.findFirst({
      where: { gameId, NOT: { status: "FINISHED" } },
      orderBy: { roundNumber: "desc" },
      include: roundInclude,
    }),

  findLastByGame: (gameId) =>
    prisma.round.findFirst({
      where: { gameId },
      orderBy: { roundNumber: "desc" },
      include: roundInclude,
    }),

  listByGame: (gameId) =>
    prisma.round.findMany({
      where: { gameId },
      orderBy: { roundNumber: "asc" },
      include: roundInclude,
    }),

  update: (id, data) => prisma.round.update({ where: { id }, data, include: roundInclude }),

  /** Cascata via schema apaga categorias, participantes, respostas e avaliações. */
  remove: (id) => prisma.round.delete({ where: { id } }),

  /**
   * Transicao condicional e atomica: so aplica se o status atual for
   * exatamente `expectedStatus`. Retorna a quantidade de linhas afetadas.
   * Base da resolucao da condicao de corrida do STOP (spec 13).
   */
  transitionIfStatus: (id, expectedStatus, data) =>
    prisma.round.updateMany({ where: { id, status: expectedStatus }, data }),

  createCategories: (roundId, categories) =>
    prisma.roundCategory.createMany({
      data: categories.map((category, index) => ({
        roundId,
        categoryId: category.categoryId ?? category.id ?? null,
        name: category.name,
        description: category.description ?? null,
        required: category.required ?? true,
        order: category.order ?? index,
      })),
    }),

  listCategories: (roundId) =>
    prisma.roundCategory.findMany({ where: { roundId }, orderBy: { order: "asc" } }),
};

export const roundParticipantRepository = {
  createMany: (roundId, playerSessionIds, status = "PLAYING") =>
    prisma.roundParticipant.createMany({
      data: playerSessionIds.map((playerSessionId) => ({ roundId, playerSessionId, status })),
      skipDuplicates: true,
    }),

  find: (roundId, playerSessionId) =>
    prisma.roundParticipant.findUnique({
      where: { roundId_playerSessionId: { roundId, playerSessionId } },
    }),

  listByRound: (roundId) =>
    prisma.roundParticipant.findMany({
      where: { roundId },
      include: {
        playerSession: {
          include: { student: { select: { id: true, name: true, registrationNumber: true } } },
        },
      },
      orderBy: { id: "asc" },
    }),

  upsert: (roundId, playerSessionId, status = "PLAYING") =>
    prisma.roundParticipant.upsert({
      where: { roundId_playerSessionId: { roundId, playerSessionId } },
      update: {},
      create: { roundId, playerSessionId, status },
    }),

  update: (roundId, playerSessionId, data) =>
    prisma.roundParticipant.update({
      where: { roundId_playerSessionId: { roundId, playerSessionId } },
      data,
    }),

  /** Atualiza somente se o status atual for o esperado (operacao atomica). */
  updateIfStatus: (roundId, playerSessionId, expectedStatus, data) =>
    prisma.roundParticipant.updateMany({
      where: { roundId, playerSessionId, status: expectedStatus },
      data,
    }),

  updateManyStatus: (roundId, fromStatuses, data) =>
    prisma.roundParticipant.updateMany({
      where: { roundId, status: { in: fromStatuses } },
      data,
    }),

  countActive: (roundId) =>
    prisma.roundParticipant.count({ where: { roundId, status: { in: ["PLAYING"] } } }),

  /**
   * IDs dos alunos que de fato entraram em pelo menos uma rodada da
   * partida — não confundir com quem apenas entrou na sala (`join` cria
   * um `Score` zerado na hora, mesmo que a rodada nunca chegue a começar
   * para esse aluno). Usado para tirar do ranking quem nunca participou.
   */
  listParticipatingStudentIds: async (gameId) => {
    const rows = await prisma.roundParticipant.findMany({
      where: { round: { gameId } },
      select: { playerSession: { select: { studentId: true } } },
      distinct: ["playerSessionId"],
    });
    return new Set(rows.map((row) => row.playerSession.studentId));
  },
};

export default roundRepository;
