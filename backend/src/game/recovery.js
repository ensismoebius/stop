import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { scheduleRoundEnd } from "./timers.js";
import roundService from "../services/roundService.js";

/**
 * Reagenda os cronometros das rodadas que estavam em andamento quando o
 * processo caiu ou foi reiniciado. O estado autoritativo vive no banco,
 * entao a recuperacao e apenas de temporizadores (spec 33).
 */
export async function recoverActiveRounds() {
  const rounds = await prisma.round.findMany({ where: { status: "PLAYING" } });
  for (const round of rounds) {
    const endsAt = round.endsAt?.getTime() ?? 0;
    const remaining = endsAt - Date.now();
    if (remaining <= 0) {
      logger.info(`Rodada ${round.id} expirou durante a parada do servidor; encerrando`);
      await roundService.handleTimeout(round.id);
      continue;
    }
    logger.info(`Rodada ${round.id} retomada; ${Math.round(remaining / 1000)}s restantes`);
    scheduleRoundEnd(round.id, remaining, () => roundService.handleTimeout(round.id));
  }
  return rounds.length;
}

export default recoverActiveRounds;
