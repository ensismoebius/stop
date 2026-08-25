import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";

/**
 * Telemetria e best-effort: uma falha aqui nunca deve derrubar o jogo
 * (spec 25 e 43).
 */
export const telemetryRepository = {
  record: async ({ type, roomId = null, roundId = null, playerSessionId = null, payload = null }) => {
    try {
      await prisma.telemetryEvent.create({
        data: { type, roomId, roundId, playerSessionId, payload },
      });
    } catch (error) {
      logger.warn(`Falha ao registrar telemetria ${type}`, error?.message ?? error);
    }
  },

  listByRound: (roundId) =>
    prisma.telemetryEvent.findMany({ where: { roundId }, orderBy: { createdAt: "asc" } }),
};

export default telemetryRepository;
