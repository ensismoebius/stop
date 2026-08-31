import nodeOs from "node:os";
import asyncHandler from "../lib/asyncHandler.js";
import roomService from "../services/roomService.js";
import viewService from "../services/viewService.js";
import roomRepository from "../repositories/roomRepository.js";
import env from "../config/env.js";
import logger from "../lib/logger.js";
import { syncStats } from "../sockets/syncRegistry.js";
import * as realtime from "../sockets/realtime.js";
import { applyRoomSettings } from "../services/room/roomSettings.js";

/** Enderecos IPv4 atuais da maquina em interfaces nao-internas, excluindo bridges do Docker/veth. */
function lanAddresses() {
  return Object.values(nodeOs.networkInterfaces())
    .flat()
    .filter(
      (iface) =>
        iface &&
        iface.family === "IPv4" &&
        !iface.internal &&
        !iface.address.startsWith("169.254.") &&
        !/^(br-|veth|docker|virbr)/.test(iface.name),
    )
    .map((iface) => iface.address);
}

/**
 * Resolve o base URL (proto://host[:port]) do link/QR de entrada da sala.
 * `null` cai no `PUBLIC_BASE_URL` (joinUrl).
 *
 * Um Host de loopback (painel aberto como "localhost") ou um IP antigo da
 * maquina (ela trocou de rede e o Host ainda carrega o endereco anterior —
 * o proprio incidente do 192.168.10.121) produz uma URL que o celular da
 * sala nunca alcanca; nesses casos substitui pelo endereco LAN atual.
 */
export function resolveBaseUrl(
  { protocol, forwardedHost, host },
  { lanAddresses: lans = [], publicBaseUrl = "", port = 3000 } = {},
) {
  if (publicBaseUrl) return null;
  if (forwardedHost) return `${protocol}://${forwardedHost}`;

  const hostname = host ? String(host).replace(/:\d+$/, "") : "";
  const loopback =
    !hostname || /^localhost$/i.test(hostname) || hostname === "127.0.0.1" || /^\[?::1\]?$/.test(hostname);
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
  const stale = isIp && lans.length > 0 && !lans.includes(hostname);

  if (loopback || stale) {
    if (lans[0]) {
      logger.warn(
        `Host "${host ?? "(vazio)"}" inalcancavel pelos celulares; usando a rede local http://${lans[0]}:${port} no link de entrada`,
      );
      return `${protocol}://${lans[0]}:${port}`;
    }
    return null;
  }
  return host ? `${protocol}://${host}` : null;
}

/** Reconstrói o base URL (proto + host) a partir do proxy reverso, se houver. */
function baseUrlFromRequest(req) {
  const protocol = req.headers["x-forwarded-proto"] ?? req.protocol ?? "http";
  return resolveBaseUrl(
    { protocol, forwardedHost: req.headers["x-forwarded-host"], host: req.get("host") },
    { lanAddresses: lanAddresses(), publicBaseUrl: env.publicBaseUrl, port: env.port },
  );
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
    // Difusão LEVE, sem o `publish()` pesado: nada de `bumpStateVersion`,
    // recarregar ranking ou reconstruir as três projeções — o volume é
    // ajustado em rajadas (arrastar o slider) e cada click não deve custar
    // uma transação de banco. A convergência total continua garantida pelos
    // publishes normais (troca de rodada), que incluem `settings`.
    //
    // Vai para a sala INTEIRA, alunos incluídos: "ocultar pontos" também vale
    // para a tela de cada aluno, e é justamente na mão deles que o interruptor
    // precisa responder na hora — esperar o próximo publish deixaria o placar
    // exposto por uma rodada inteira depois de o professor escondê-lo.
    realtime.toRoom(room.code, "roomSettingsChanged", settings);
    return res.json({ roomCode: room.code, settings });
  }),
};

export default roomController;
