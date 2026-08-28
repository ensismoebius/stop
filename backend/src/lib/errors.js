/** Erro de aplicacao: carrega status HTTP e codigo estavel para serializar como `{ error }`. */
export class AppError extends Error {
  /** Registra status HTTP e codigo estavel para a API; `details` e opcional. */
  constructor(message, { status = 400, code = "BAD_REQUEST", details } = {}) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Converte em payload de resposta: `{ error: { code, message, details } }`. */
  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}

export const badRequest = (message, details) =>
  new AppError(message, { status: 400, code: "BAD_REQUEST", details });

export const unauthorized = (message = "Não autenticado") =>
  new AppError(message, { status: 401, code: "UNAUTHORIZED" });

export const forbidden = (message = "Não autorizado") =>
  new AppError(message, { status: 403, code: "FORBIDDEN" });

export const notFound = (message = "Recurso não encontrado") =>
  new AppError(message, { status: 404, code: "NOT_FOUND" });

export const conflict = (message, details) =>
  new AppError(message, { status: 409, code: "CONFLICT", details });

export const unprocessable = (message, details) =>
  new AppError(message, { status: 422, code: "UNPROCESSABLE", details });
