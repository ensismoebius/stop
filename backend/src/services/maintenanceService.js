import prisma from "../lib/prisma.js";
import { badRequest } from "../lib/errors.js";

const BACKUP_VERSION = 1;

/**
 * Ordem de dependência dos modelos (quem referencia quem via FK). A
 * exportação não precisa dela — é só serialização —, mas a IMPORTAÇÃO sim:
 * cada modelo entra depois de tudo que ele referencia, senão o insert
 * falha por violação de integridade. Para apagar, a mesma lista é
 * percorrida ao contrário (dependentes primeiro), o que também respeita
 * os `onDelete: Restrict` do schema (Student/GameResult, Student/
 * PlayerSession — ver modelo-de-dados na wiki): eles nunca bloqueiam
 * porque o lado que os restringiria já foi apagado antes.
 */
const MODELS_IN_DEPENDENCY_ORDER = [
  "teacher",
  "class",
  "student",
  "enrollment",
  "categorySet",
  "category",
  "game",
  "room",
  "playerSession",
  "round",
  "roundCategory",
  "roundParticipant",
  "answer",
  "answerReview",
  "score",
  "gameResult",
  "telemetryEvent",
];

/** Cópia completa do banco (config + histórico), como um único JSON. */
async function exportAll() {
  const data = {};
  for (const model of MODELS_IN_DEPENDENCY_ORDER) {
    data[model] = await prisma[model].findMany();
  }
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

/**
 * Restaura um backup gerado por `exportAll`: apaga o banco inteiro e repõe
 * exatamente o que está no arquivo — não é uma mesclagem. Uma única
 * transação: ou o banco termina como o backup descreve, ou não muda nada.
 */
async function importAll(backup) {
  if (!backup || typeof backup !== "object" || backup.version !== BACKUP_VERSION || !backup.data) {
    throw badRequest("Arquivo de backup inválido ou de uma versão incompatível.");
  }

  await prisma.$transaction(
    async (tx) => {
      for (const model of [...MODELS_IN_DEPENDENCY_ORDER].reverse()) {
        await tx[model].deleteMany({});
      }
      for (const model of MODELS_IN_DEPENDENCY_ORDER) {
        const rows = backup.data[model] ?? [];
        if (rows.length === 0) continue;
        await tx[model].createMany({ data: rows });
      }
    },
    { timeout: 60_000 },
  );
}

/**
 * Apaga só o histórico de partidas (Game e tudo que pende dele via
 * Cascade: Room, PlayerSession, Round e sua árvore, Score, GameResult) e a
 * telemetria — nunca turmas, alunos ou conjuntos de categoria, que são
 * configuração, não histórico.
 */
async function eraseHistory() {
  const [games, telemetry] = await prisma.$transaction(
    [prisma.game.deleteMany({}), prisma.telemetryEvent.deleteMany({})],
    { timeout: 60_000 },
  );
  return { gamesDeleted: games.count, telemetryEventsDeleted: telemetry.count };
}

export const maintenanceService = { exportAll, importAll, eraseHistory };

export default maintenanceService;
