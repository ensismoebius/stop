import { PrismaClient } from "@prisma/client";
import logger from "./logger.js";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__stopPrisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === "true" ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__stopPrisma = prisma;
}

/** Primeira linha util da mensagem do Prisma, que costuma ser multilinha. */
function detail(error) {
  const lines = String(error?.message ?? error ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.find((line) => !line.startsWith("Invalid `")) ?? lines[0] ?? "erro desconhecido";
}

/**
 * Verificacao de partida: conexao e schema aplicado.
 *
 * Sem isso, um banco vazio so se manifesta como HTTP 500 no primeiro login,
 * sem indicar a causa. Aqui a instrucao aparece no log do servidor.
 *
 * @returns {Promise<{ healthy: boolean, reason?: string }>}
 */
export async function checkDatabase() {
  try {
    await prisma.teacher.count();
    return { healthy: true };
  } catch (error) {
    if (error?.code === "P2021" || error?.code === "P2022") {
      logger.error(
        "Banco de dados sem o schema do STOP. Rode as migracoes antes de usar a aplicacao:\n" +
          "  cd backend && npx prisma migrate deploy && npm run seed",
      );
      return { healthy: false, reason: "SCHEMA_MISSING" };
    }
    // Conexao recusada, host errado ou credencial invalida chegam aqui.
    // O Prisma 6 lanca PrismaClientInitializationError, as vezes sem `code`.
    const connectionCodes = ["P1000", "P1001", "P1002", "P1003", "P1010"];
    if (
      error?.name === "PrismaClientInitializationError" ||
      connectionCodes.includes(error?.code)
    ) {
      logger.error(
        `Nao foi possivel conectar ao banco: ${detail(error)}\n` +
          "  Verifique DATABASE_URL no .env e se o MySQL esta no ar " +
          "(docker compose up -d mysql).",
      );
      return { healthy: false, reason: "UNREACHABLE" };
    }
    logger.error(`Falha ao verificar o banco de dados: ${detail(error)}`);
    return { healthy: false, reason: "UNKNOWN" };
  }
}

/** Encerra a conexao com o banco; usado em shutdown gracioso e nos testes. */
export async function disconnectPrisma() {
  try {
    await prisma.$disconnect();
  } catch (error) {
    logger.warn("Falha ao desconectar do Prisma", error);
  }
}

export default prisma;
