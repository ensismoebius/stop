import { z } from "zod";

const id = z.coerce.number().int().positive();
const trimmed = (max) => z.string().trim().min(1).max(max);

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

// Ou um avatar pronto (/avatars/xxx.svg) ou uma foto comprimida em data URL
// (camera do aluno). O limite de tamanho evita que um upload gigante va
// parar no banco (spec 6).
export const roomAvatarSchema = z.object({
  registrationNumber: trimmed(40),
  avatarUrl: z
    .string()
    .max(180_000)
    .regex(
      /^(\/avatars\/[a-z0-9-]+\.svg|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*)$/,
      "Avatar inválido",
    ),
});

export const roundCreateSchema = z.object({
  gameId: id,
  categorySetId: id,
  durationSeconds: z.coerce.number().int().min(15).max(900).optional(),
  themeName: z.string().trim().max(120).optional(),
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

export const socketAnswerSchema = z.object({
  roundId: id,
  roundCategoryId: id,
  value: z.string().max(120),
});

export const socketRoundSchema = z.object({ roundId: id });

export const socketFullscreenSchema = z.object({
  roundId: id,
  reason: z.string().trim().max(60).optional(),
});

/** Decisao do aluno na correcao colaborativa (enhancements.md secao 45). */
export const socketReviewSchema = z.object({
  reviewId: id,
  decision: z.enum(["VALID", "INVALID"]),
});

export const socketTelemetrySchema = z.object({
  roundId: id.optional(),
  type: trimmed(40),
  payload: z.record(z.unknown()).optional(),
});

export default {
  loginSchema,
  classSchema,
  studentSchema,
  categorySetSchema,
  gameSchema,
  roundCreateSchema,
};
