import { AppError } from "../lib/errors.js";
import logger from "../lib/logger.js";

/** Resposta 404 padrao para rotas inexistentes. */
export function notFoundHandler(_req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Rota não encontrada" } });
}

// eslint-disable-next-line no-unused-vars
/** Converte erros lancados pelas rotas em respostas JSON previsiveis (AppError/Prisma). */
export function errorHandler(error, _req, res, _next) {
  if (error instanceof AppError) {
    return res.status(error.status).json(error.toJSON());
  }

  // Erros conhecidos do Prisma viram respostas previsiveis.
  if (error?.code === "P2002") {
    return res.status(409).json({
      error: {
        code: "CONFLICT",
        message: "Registro duplicado",
        details: error.meta?.target ?? null,
      },
    });
  }
  if (error?.code === "P2025") {
    return res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Recurso não encontrado" } });
  }
  // Violacao de FK: normalmente uma tentativa de remover algo que ainda
  // tem partidas/sessoes vinculadas (spec 44 — historico nao pode sumir junto).
  if (error?.code === "P2003") {
    return res.status(409).json({
      error: {
        code: "CONFLICT",
        message: "Não é possível remover: existem registros vinculados (partidas ou participações).",
        details: error.meta?.field_name ?? null,
      },
    });
  }
  if (error?.code === "INVALID_ROUND_TRANSITION") {
    return res.status(409).json({ error: { code: error.code, message: error.message } });
  }

  logger.error("Erro nao tratado", error);
  return res
    .status(500)
    .json({ error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" } });
}

export default errorHandler;
