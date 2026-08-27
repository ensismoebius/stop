import { z } from "zod";

const id = z.coerce.number().int().positive();
const trimmed = (max) => z.string().trim().min(1).max(max);
// operationId: UUID gerado pelo cliente por comando (spec 3.1). Optional de
// proposito — clientes antigos/reconexoes sem retry ainda funcionam; quando
// presente, o wrap desduplica via ProcessedOperation.
const operationId = z.string().trim().min(1).max(64);

export const loginSchema = z.object({
  email: z.string().trim().email().max(180),
  // Sem minimo: o login apenas confere a credencial configurada em
  // ADMIN_PASSWORD. Exigir tamanho aqui impediria o acesso de quem
  // configurou uma senha curta, sem ganho de seguranca.
  password: z.string().min(1).max(200),
});

export const classSchema = z.object({
  name: trimmed(120),
  code: trimmed(40),
  discipline: z.string().trim().max(120).optional().nullable(),
});

export const classUpdateSchema = classSchema.partial();

export const studentSchema = z.object({
  registrationNumber: trimmed(40),
  name: trimmed(160),
  classIds: z.array(id).min(1),
  active: z.boolean().optional(),
});

export const studentUpdateSchema = studentSchema.partial();

export const studentBulkSchema = z.object({
  classId: id,
  students: z
    .array(z.object({ registrationNumber: trimmed(40), name: trimmed(160) }))
    .min(1)
    .max(500),
});

export const categorySetSchema = z.object({
  name: trimmed(120),
  description: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().optional(),
  categories: z
    .array(
      z.object({
        name: trimmed(80),
        description: z.string().trim().max(300).optional().nullable(),
        required: z.boolean().optional(),
        order: z.number().int().min(0).max(100).optional(),
      }),
    )
    .min(1)
    .max(20)
    .optional(),
});

export const categorySetUpdateSchema = categorySetSchema.partial();

export const categorySchema = z.object({
  categorySetId: id,
  name: trimmed(80),
  description: z.string().trim().max(300).optional().nullable(),
  required: z.boolean().optional(),
  order: z.number().int().min(0).max(100).optional(),
  active: z.boolean().optional(),
});

export const categoryUpdateSchema = categorySchema.partial();

export const gameSchema = z.object({
  name: trimmed(120),
  classId: id,
});

export const roomJoinSchema = z.object({
  registrationNumber: trimmed(40),
});

// Ou o rosto montado pelo aluno (`face:v1:…`) ou uma foto comprimida em data URL
// (camera do aluno). O limite de tamanho evita que um upload gigante va
// parar no banco (spec 6).
export const roomAvatarSchema = z.object({
  registrationNumber: trimmed(40),
  // Só dois formatos: o rosto montado pelo aluno (`face:v1:` + um caractere
  // por característica) e a foto tirada na hora. A receita guarda apenas
  // números — nunca marcação —, então nada de SVG de origem desconhecida
  // entra pelo `avatarUrl`. Caminhos de arquivo não valem mais: a pasta de
  // avatares prontos deixou de existir.
  avatarUrl: z
    .string()
    .max(180_000)
    .regex(
      /^(face:v1:[0-9a-z]{1,40}|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*)$/,
      "Avatar inválido",
    ),
});

export const roundCreateSchema = z.object({
  gameId: id,
  categorySetId: id,
  durationSeconds: z.coerce.number().int().min(15).max(900).optional(),
  themeName: z.string().trim().max(120).optional(),
  letterRule: z.enum(["STARTS_WITH", "CONTAINS"]).optional(),
});

export const answerReviewSchema = z.object({
  reviewState: z.enum(["PENDING", "VALID", "INVALID", "BLANK", "DUPLICATE"]),
});

export const answerBulkReviewSchema = z.object({
  reviews: z
    .array(z.object({ answerId: id, reviewState: answerReviewSchema.shape.reviewState }))
    .min(1)
    .max(500),
});

// ---------------------------------------------------------------------------
// Payloads de Socket.IO (spec 53). Nunca confiar no cliente.
// ---------------------------------------------------------------------------

export const socketJoinRoomSchema = z.object({
  roomCode: trimmed(24),
  role: z.enum(["player", "teacher", "screen"]).default("player"),
  playerToken: z.string().trim().max(200).optional(),
  adminToken: z.string().trim().max(600).optional(),
});

export const socketIdentifySchema = z.object({
  roomCode: trimmed(24),
  registrationNumber: trimmed(40),
});

/** `ready` é idempotente (spec 3.1): so traz o operationId opcional. */
export const socketReadySchema = z.object({
  operationId: operationId.optional(),
});

export const socketAnswerSchema = z.object({
  roundId: id,
  roundCategoryId: id,
  value: z.string().max(120),
  operationId: operationId.optional(),
});

export const socketRoundSchema = z.object({ roundId: id, operationId: operationId.optional() });

export const socketFullscreenSchema = z.object({
  roundId: id,
  reason: z.string().trim().max(60).optional(),
  operationId: operationId.optional(),
});

/** Decisao do aluno na correcao colaborativa (enhancements.md secao 45). */
export const socketReviewSchema = z.object({
  reviewId: id,
  decision: z.enum(["VALID", "INVALID"]),
  operationId: operationId.optional(),
});

/** Conjunto fixo: rapido de tocar, facil de moderar, sem texto livre. */
export const EMOJI_REACTIONS = ["😂", "😮", "👍", "🔥", "❤️", "😈", "🎉"];

export const socketEmojiSchema = z.object({
  emoji: z.enum(EMOJI_REACTIONS),
});

export const socketTelemetrySchema = z.object({
  roundId: id.optional(),
  type: trimmed(40),
  payload: z.record(z.unknown()).optional(),
});

/** Heartbeat da aplicação: posição `(roomEpoch, stateVersion)` do cliente. */
export const socketHeartbeatSchema = z.object({
  roomEpoch: z.number().int().min(0).optional(),
  stateVersion: z.number().int().min(0).optional(),
  sentAt: z.number().int().optional(),
});

export default {
  loginSchema,
  classSchema,
  studentSchema,
  categorySetSchema,
  gameSchema,
  roundCreateSchema,
};
