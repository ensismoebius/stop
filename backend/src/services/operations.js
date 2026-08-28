import prisma from "../lib/prisma.js";

/**
 * Idempotência de comandos de escrita (spec 3.1). O cliente gera um
 * `operationId` (UUID) por comando; a tabela `ProcessedOperation` usa a
 * chave `(roomId, id)` para garantir que o mesmo comando seja executado uma
 * única vez mesmo quando o ack se perde na rede (retry com o mesmo id).
 *
 * Contrato (modelo em `prisma/schema.prisma`):
 *  - `PENDING`  = reivindicado, em processamento;
 *  - `DONE`     = resultado gravado em `responseJson` — um reenvio com o
 *    mesmo id devolve esse resultado em vez de reexecutar;
 *  - `FAILED`   = (apenas se o processo morreu no meio) — `claimOperation`
 *    toma o registro e reexecuta;
 *  - registro apagado em erro = a tentativa falhou e o cliente pode
 *    reexecutar com o mesmo id em total segurança.
 *
 * todo `claimOperation` usa o `create` como "lock": o primeiro create
 * vence, os concorrentes veem P2002 e esperam o vencedor terminar.
 */

const PENDING_WAIT_MS = 150;
const PENDING_WAIT_STEP_MS = 25;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Aguarda um registro PENDING deixar de estar pendente (janela curta). */
async function resolveExisting(roomId, operationId) {
  const deadline = Date.now() + PENDING_WAIT_MS;
  while (Date.now() < deadline) {
    const existing = await prisma.processedOperation.findUnique({
      where: { roomId_id: { roomId, id: operationId } },
    });
    if (!existing) return null; // tentativa anterior falhou e foi apagada
    if (existing.status === "DONE") return existing;
    if (existing.status === "FAILED") return existing;
    await sleep(PENDING_WAIT_STEP_MS);
  }
  return { status: "PENDING" };
}

/**
 * Executa `operation` exatamente uma vez por `operationId` dentro da sala.
 * Devolve o resultado gravado num reenvio (duplicado) sem chamar `operation`.
 */
export async function claimOperation({ operationId, roomId, playerSessionId, command }, operation) {
  try {
    await prisma.processedOperation.create({
      data: { id: operationId, roomId, playerSessionId, command, status: "PENDING" },
    });
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const existing = await resolveExisting(roomId, operationId);
    if (existing && existing.status === "DONE") return existing.responseJson;
    // PENDING esgotada a espera ou FAILED: o processamento anterior nao
    // terminou de forma confiavel — assume o registro e reexecuta.
  }

  const record = { roomId, id: operationId };
  try {
    const result = await operation();
    await prisma.processedOperation.upsert({
      where: { roomId_id: record },
      create: {
        id: operationId,
        roomId,
        playerSessionId,
        command,
        status: "DONE",
        responseJson: result ?? null,
      },
      update: { status: "DONE", responseJson: result ?? null },
    });
    return result;
  } catch (error) {
    // A tentativa falhou: remove o registro para que um retry legitimo com o
    // mesmo id reexecute do zero. Se o delete falhar tambem, ignora — o erro
    // original e o que importa.
    await prisma.processedOperation.delete({ where: { roomId_id: record } }).catch(() => {});
    throw error;
  }
}

export default claimOperation;