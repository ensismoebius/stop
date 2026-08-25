import prisma from "../lib/prisma.js";
import logger from "../lib/logger.js";
import { scheduleRoundEnd } from "./timers.js";
import roundService from "../services/roundService.js";
import { beginPlaying } from "../services/round/lifecycle.js";
import { scheduleCollaborativeCorrectionTimeout } from "../services/round/collaborativeCorrection.js";

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

  // Rodada presa em STARTING (spec 4-7/54): nao ha como retomar com
  // seguranca a animacao/contagem sincronizada depois de um tempo de
  // parada desconhecido — avanca direto para PLAYING.
  const starting = await prisma.round.findMany({ where: { status: "STARTING" } });
  for (const round of starting) {
    logger.info(`Rodada ${round.id} estava em STARTING durante a parada do servidor; avançando para PLAYING`);
    await beginPlaying(round.id).catch((error) =>
      logger.error(`Falha ao retomar a rodada ${round.id} presa em STARTING`, error),
    );
  }

  // Rodada presa em COLLABORATIVE_CORRECTION: reagenda o fechamento pelo
  // prazo ja persistido, ou fecha imediatamente se o prazo ja passou.
  const collaborating = await prisma.round.findMany({ where: { status: "COLLABORATIVE_CORRECTION" } });
  for (const round of collaborating) {
    const endsAt = round.collaborativeCorrectionEndsAt?.getTime() ?? 0;
    const remaining = endsAt - Date.now();
    if (remaining <= 0) {
      logger.info(`Correção colaborativa da rodada ${round.id} expirou durante a parada; fechando`);
      await roundService.closeCollaborativeCorrection(round.id);
      continue;
    }
    logger.info(`Correção colaborativa da rodada ${round.id} retomada; ${Math.round(remaining / 1000)}s restantes`);
    scheduleCollaborativeCorrectionTimeout(round.id, remaining);
  }

  return rounds.length + starting.length + collaborating.length;
}

export default recoverActiveRounds;
