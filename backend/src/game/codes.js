import { randomBytes, randomInt } from "node:crypto";

// Sem I, O, 0 e 1 para evitar erro de leitura no quadro/TV.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Gera o identificador publico da sala. Exemplo: STOP-7F42 (spec 5). */
export function generateRoomCode(length = 4, prefix = "STOP") {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return `${prefix}-${code}`;
}

/** Token opaco da sessao do aluno (spec 46). */
export function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}

export default generateRoomCode;
