import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma.js";
import env from "../config/env.js";
import { unauthorized } from "../lib/errors.js";
import playerSessionRepository from "../repositories/playerSessionRepository.js";

const ADMIN_AUDIENCE = "stop-admin";

export const authService = {
  /** Autentica o professor por email/senha e devolve um token JWT administrativo. */
  async login({ email, password }) {
    const teacher = await prisma.teacher.findUnique({ where: { email: email.toLowerCase() } });
    // Compara sempre, mesmo sem usuario, para nao vazar existencia por tempo.
    const hash = teacher?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidix";
    const passwordMatches = await bcrypt.compare(password, hash);
    if (!teacher || !teacher.active || !passwordMatches) {
      throw unauthorized("Credenciais inválidas");
    }

    const token = jwt.sign(
      { sub: String(teacher.id), role: teacher.role, email: teacher.email },
      env.sessionSecret,
      { expiresIn: env.adminTokenTtl, audience: ADMIN_AUDIENCE },
    );

    return {
      token,
      teacher: { id: teacher.id, name: teacher.name, email: teacher.email, role: teacher.role },
    };
  },

  /** Valida um token JWT administrativo e devolve o professor correspondente. */
  verifyAdminToken(token) {
    try {
      const payload = jwt.verify(token, env.sessionSecret, { audience: ADMIN_AUDIENCE });
      return { id: Number(payload.sub), role: payload.role, email: payload.email };
    } catch {
      throw unauthorized("Sessão administrativa inválida ou expirada");
    }
  },

  /**
   * A sessao do aluno usa um token opaco persistido no banco (spec 46).
   * O servidor continua sendo a autoridade: o token apenas aponta para a
   * sessao, nunca carrega estado do jogo.
   */
  async resolvePlayerSession(token) {
    if (!token) throw unauthorized("Sessão do aluno ausente");
    const session = await playerSessionRepository.findByToken(token);
    if (!session) throw unauthorized("Sessão do aluno inválida");
    return session;
  },

  hashPassword: (password) => bcrypt.hash(password, 10),
};

export default authService;
