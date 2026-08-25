import { badRequest } from "../lib/errors.js";

function format(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

/** Valida e substitui `req.body` pelo objeto ja normalizado pelo zod. */
export const validateBody = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    return next(badRequest("Dados inválidos", format(result.error)));
  }
  req.body = result.data;
  return next();
};

/** Validacao de payloads de socket: retorna `null` quando invalido. */
export function parseSocketPayload(schema, payload) {
  const result = schema.safeParse(payload ?? {});
  if (!result.success) {
    return { ok: false, issues: format(result.error) };
  }
  return { ok: true, data: result.data };
}

export default validateBody;
