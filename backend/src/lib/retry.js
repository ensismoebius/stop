/**
 * Retenta operações de escrita que colidiram em conflito transacional.
 *
 * Sob concorrência real (vários sockets do mesmo aluno, reconexão sobreposta
 * com desconexão) o Prisma + MySQL InnoDB pode falhar a segunda atualização
 * na mesma linha com o erro 1020 "Record has changed since last read"
 * (superfície: PrismaClientKnownRequestError code P2034). O caso típico é o
 * `markDisconnected` de um socket antigo competindo com o `markConnected` do
 * reconnect — se a operação falhasse sem retry, o socketId da sessão ficaria
 * preso no banco e a sala ficaria "Sincronizando X/Y" para sempre. Um retry
 * curto resolve o conflito porque a outra transação já comitou (last-write-wins).
 */

import logger from "./logger.js";

const CONFLICT_PATTERNS = /(p2034|1213|deadlock|record has changed since last read|error code:?\s*1020)/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @template T
 * @param {() => Promise<T>} operation
 * @param {{ tries?: number, delayMs?: number }} options
 * @returns {Promise<T>}
 */
export async function retryOnWriteConflict(operation, { tries = 3, delayMs = 30 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = `${error?.message ?? ""} ${error?.code ?? ""} ${error?.meta?.message ?? ""}`;
      if (!CONFLICT_PATTERNS.test(message)) throw error;
      if (attempt < tries - 1) {
        logger.debug("Conflito de escrita no banco — nova tentativa", {
          attempt: attempt + 1,
          tries,
          error: { name: error?.name ?? "Error", message: error?.message ?? String(error), code: error?.code ?? null },
        });
        await sleep(delayMs * (attempt + 1));
      }
    }
  }
  throw lastError;
}