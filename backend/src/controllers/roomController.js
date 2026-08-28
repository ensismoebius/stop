import asyncHandler from "../lib/asyncHandler.js";
import roomService from "../services/roomService.js";
import viewService from "../services/viewService.js";
import roomRepository from "../repositories/roomRepository.js";
import { syncStats } from "../sockets/syncRegistry.js";
import { applyRoomSettings } from "../services/room/roomSettings.js";
import roomState from "../services/room/roomState.js";

function baseUrlFromRequest(req) {
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol;
  const host = req.headers["x-forwarded-host"] ?? req.get("host");
  return `${proto}://${host}`;
}

export const roomController = {
  /** Rota publica: usada pela tela de entrada do aluno. */
  get: asyncHandler(async (req, res) => res.json(await roomService.publicInfo(req.params.code))),

  qrCode: asyncHandler(async (req, res) =>
    res.json(await roomService.qrCode(req.params.code, baseUrlFromRequest(req))),
  ),

  /** Passo 1 da identificacao: devolve o nome para confirmacao (spec 6). */
  identify: asyncHandler(async (req, res) =>
    res.json(await roomService.identify(req.params.code, req.body.registrationNumber)),
  ),

  /** Aluno escolhe uma foto ou avatar pronto ao entrar (spec 6). */
  setAvatar: asyncHandler(async (req, res) =>
    res.json(
      await roomService.setAvatar(req.params.code, req.body.registrationNumber, req.body.avatarUrl),
    ),
  ),

  /** Passo 2: confirma a identidade e cria a sessao. */
  join: asyncHandler(async (req, res) =>
    res.status(201).json(await roomService.join(req.params.code, req.body.registrationNumber)),
  ),

  teacherState: asyncHandler(async (req, res) => {
    const version = await roomRepository.getVersion((await roomService.getByCode(req.params.code)).id);
    const state = await viewService.teacherState(req.params.code, { version });
    state.syncStats = syncStats(req.params.code, {
      totalConnected: state.players.filter((player) => player.connected).length,
      currentEpoch: version.roomEpoch,
      currentVersion: version.stateVersion,
    });
    return res.json(state);
  }),

  publicState: asyncHandler(async (req, res) => {
    const version = await roomRepository.getVersion((await roomService.getByCode(req.params.code)).id);
    return res.json(await viewService.publicState(req.params.code, { version }));
  }),

  playerState: asyncHandler(async (req, res) => {
    const version = await roomRepository.getVersion(req.playerSession.roomId);
    return res.json(await viewService.playerState(req.playerSession.id, version));
  }),

  close: asyncHandler(async (req, res) =>
    res.json(await roomService.setStatus(req.params.code, "CLOSED")),
  ),

  /** Atualiza ajustes de apresentação AO VIVO (ex.: ocultar pontos no ranking). */
  updateSettings: asyncHandler(async (req, res) => {
    const room = await roomService.getByCode(req.params.code);
    const settings = applyRoomSettings(
      room.code,
      typeof req.body === "object" && req.body !== null ? req.body : {},
    );
    // Propaga a mudança para a tela pública via outbound queue (latest-wins).
    await roomState.publish(room.code);
    return res.json({ roomCode: room.code, settings });
  }),
};

export default roomController;
