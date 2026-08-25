import authService from "../services/authService.js";
import roomService from "../services/roomService.js";
import { forbidden, unauthorized } from "../lib/errors.js";

/**
 * Resolve e valida a identidade de quem entrou na sala.
 * O papel declarado pelo cliente nunca e aceito sozinho (spec 34).
 */
export async function authenticateJoin({ roomCode, role, playerToken, adminToken }) {
  const room = await roomService.getByCode(roomCode);

  if (role === "teacher") {
    if (!adminToken) throw unauthorized("Token administrativo ausente");
    const teacher = authService.verifyAdminToken(adminToken);
    return { role: "teacher", room, teacher };
  }

  if (role === "screen") {
    // A tela publica nao recebe dados privados; nao exige credencial.
    return { role: "screen", room };
  }

  if (!playerToken) throw unauthorized("Sessão do aluno ausente");
  const session = await authService.resolvePlayerSession(playerToken);
  if (session.roomId !== room.id) {
    throw forbidden("Esta sessão pertence a outra sala");
  }
  return { role: "player", room, session };
}

export default authenticateJoin;
