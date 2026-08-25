import authService from "../services/authService.js";
import { forbidden, unauthorized } from "../lib/errors.js";

function extractBearer(req) {
  const header = req.headers.authorization ?? "";
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return null;
}

/**
 * Protege os endpoints administrativos (spec 34/35).
 * A sessao do aluno nunca e aceita aqui.
 */
export function requireTeacher(req, _res, next) {
  const token = extractBearer(req);
  if (!token) return next(unauthorized("Token administrativo ausente"));
  try {
    const teacher = authService.verifyAdminToken(token);
    if (!["TEACHER", "ADMIN"].includes(teacher.role)) {
      return next(forbidden("Perfil sem permissão administrativa"));
    }
    req.teacher = teacher;
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Protege endpoints do aluno via token de sessao (header x-player-token). */
export async function requirePlayer(req, _res, next) {
  const token = req.headers["x-player-token"] ?? extractBearer(req);
  try {
    req.playerSession = await authService.resolvePlayerSession(token);
    return next();
  } catch (error) {
    return next(error);
  }
}

export default requireTeacher;
