import QRCode from "qrcode";
import roomRepository from "../repositories/roomRepository.js";
import playerSessionRepository from "../repositories/playerSessionRepository.js";
import studentService from "./studentService.js";
import gameService from "./gameService.js";
import scoreRepository from "../repositories/scoreRepository.js";
import viewService from "./viewService.js";
import { generateRoomCode, generateSessionToken } from "../game/codes.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import * as realtime from "../sockets/realtime.js";
import { dropRoom as dropClientSyncRoom } from "../sockets/syncRegistry.js";
import roomState from "./room/roomState.js";
import env from "../config/env.js";

const MAX_CODE_ATTEMPTS = 8;

/**
 * Resolve a matricula para um aluno matriculado na turma da sala —
 * checagem repetida por `identify`/`setAvatar`/`join` (mesma regra de
 * posse, spec 6). Centralizado para nao divergir entre os tres pontos.
 */
async function resolveEnrolledStudent(room, registrationNumber) {
  const student = await studentService.findByRegistration(registrationNumber);
  if (!student) {
    throw notFound("Matrícula não encontrada. Verifique o número informado.");
  }
  if (!studentService.belongsToClass(student, room.game.classId)) {
    throw forbidden("Esta matrícula não pertence à turma desta partida.");
  }
  return student;
}

export const roomService = {
  /** Cria a sala e o identificador publico exibido no QR Code (spec 5). */
  async create(gameId) {
    await gameService.get(gameId);
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = generateRoomCode();
      const existing = await roomRepository.findByCode(code);
      if (existing) continue;
      return roomRepository.create({ gameId, code, status: "OPEN" });
    }
    throw conflict("Não foi possível gerar um código de sala único");
  },

  async getByCode(code) {
    const room = await roomRepository.findByCode(code);
    if (!room) throw notFound("Sala não encontrada");
    return room;
  },

  /** Dados publicos da sala usados na tela de entrada do aluno. */
  async publicInfo(code) {
    const room = await roomService.getByCode(code);
    return {
      code: room.code,
      status: room.status,
      game: { name: room.game.name },
      className: room.game.class?.name ?? null,
      players: room.sessions.length,
    };
  },

  joinUrl(code, baseUrl) {
    const base = (baseUrl || env.publicBaseUrl || "").replace(/\/+$/, "");
    return `${base}/join/${code}`;
  },

  /**
   * O QR Code representa apenas a sala. Nunca contem dados pessoais,
   * matricula ou senha (spec 36).
   */
  async qrCode(code, baseUrl) {
    await roomService.getByCode(code);
    const url = roomService.joinUrl(code, baseUrl);
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 1 });
    return { code, url, dataUrl };
  },

  /**
   * Passo 1 da identificacao: o aluno informa a matricula e o servidor
   * devolve o nome cadastrado para confirmacao (spec 6).
   */
  async identify(code, registrationNumber) {
    const room = await roomService.getByCode(code);
    const student = await resolveEnrolledStudent(room, registrationNumber);
    return {
      student: {
        name: student.name,
        registrationNumber: student.registrationNumber,
        avatarUrl: student.avatarUrl,
      },
      room: { code: room.code },
    };
  },

  /**
   * Aluno escolhe uma foto tirada na hora ou um avatar pronto — persiste no
   * cadastro do aluno (vale para as proximas partidas tambem). Mesma
   * validacao de posse do identify/join: matricula precisa pertencer a
   * turma da sala.
   */
  async setAvatar(code, registrationNumber, avatarUrl) {
    const room = await roomService.getByCode(code);
    const student = await resolveEnrolledStudent(room, registrationNumber);
    const updated = await studentService.update(student.id, { avatarUrl });
    return { avatarUrl: updated.avatarUrl };
  },

  /** Passo 2: o aluno confirma a identidade e recebe a sessao (spec 46). */
  async join(code, registrationNumber) {
    const room = await roomService.getByCode(code);
    if (room.status === "CLOSED") throw badRequest("Esta sala está encerrada");

    const student = await resolveEnrolledStudent(room, registrationNumber);

    const existing = await playerSessionRepository.findByRoomAndStudent(room.id, student.id);
    const session =
      existing ??
      (await playerSessionRepository.create({
        roomId: room.id,
        studentId: student.id,
        token: generateSessionToken(),
        status: "READY",
      }));

    if (existing && existing.status === "WAITING") {
      await playerSessionRepository.update(existing.id, { status: "READY" });
    }

    await scoreRepository.ensure(room.gameId, student.id);

    const payload = {
      playerSessionId: session.id,
      playerToken: session.token,
      student: {
        id: student.id,
        name: student.name,
        registrationNumber: student.registrationNumber,
        avatarUrl: student.avatarUrl,
      },
      room: { code: room.code },
      game: { id: room.gameId, name: room.game.name },
    };

    if (!existing) {
      const state = await viewService.teacherState(room.code);
      realtime.toTeachers(room.code, "playerJoined", {
        playerSessionId: session.id,
        name: student.name,
        registrationNumber: student.registrationNumber,
      });
      realtime.toTeachers(room.code, "roomState", state);
      realtime.toScreens(room.code, "roomState", await viewService.publicState(room.code));
    }

    return payload;
  },

  async setStatus(code, status) {
    const room = await roomService.getByCode(code);
    const updated = await roomRepository.update(room.id, { status });
    realtime.toRoom(code, "roomStatusChanged", { status: updated.status });
    if (status === "CLOSED") {
      // Encerrou a sessão: invalida snapshot/registro e difusões pendentes —
      // sala fechada não deve manter estado-residual de outra sessão.
      roomState.dropRoom(code);
      dropClientSyncRoom(code);
    }
    return updated;
  },
};

export default roomService;
