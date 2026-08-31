import logger from "../../lib/logger.js";

/**
 * Ajustes de apresentação AO VIVO de uma sala, mantidos em memória (escolha
 * deliberada: preferências efêmeras da quadra, não dados persistentes no
 * banco — como o `syncStats`). Cada sala guarda um mapa na chave, então um
 * campo desconhecido no corpo do PATCH simplesmente cria uma entrada nova sem
 * quebrar o que já existe. Servidores com várias instâncias devem manter os
 * adjusts em um cache compartilhado; aqui o escopo é single-node.
 */
const settingsByRoom = new Map();

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const defaults = ({ hidePoints = false, volume = 0.65, muted = false } = {}) => ({
  hidePoints: Boolean(hidePoints),
  volume: clamp(Number.isFinite(volume) ? volume : 0.65, 0, 1),
  muted: Boolean(muted),
});

/** Devolve o snapshot atual de ajustes (defaults se nunca setado). */
export function getRoomSettings(roomCode) {
  return settingsByRoom.get(roomCode) ?? defaults();
}

/**
 * Aplica um PATCH parcial nos ajustes e devolve o novo snapshot. Campos são
 * mesclados, então `{ hidePoints: true }` não apaga demais.
 */
export function applyRoomSettings(roomCode, patch = {}) {
  // Parte dos ajustes COMPLETOS (defaults preenchidos), não de `{}`: um PATCH
  // parcial — `{ hidePoints: true }`, que é como a UI manda — produzia um
  // objeto sem `volume`/`muted`, e daí em diante todo cliente recebia
  // `volume: undefined` (o controle de áudio da tela pública vira NaN).
  const current = getRoomSettings(roomCode);
  const next = { ...current, ...patch };
  if (patch.hidePoints !== undefined) next.hidePoints = Boolean(patch.hidePoints);
  if (patch.volume !== undefined) {
    next.volume = clamp(Number.isFinite(patch.volume) ? patch.volume : 0.65, 0, 1);
  }
  if (patch.muted !== undefined) next.muted = Boolean(patch.muted);
  settingsByRoom.set(roomCode, next);
  logger.info(`Ajustes da sala ${roomCode} atualizados`, next);
  return { ...next };
}

/** Limpa os ajustes quando a sala é encerrada (evita vazamento de memória). */
export function dropRoomSettings(roomCode) {
  settingsByRoom.delete(roomCode);
}
