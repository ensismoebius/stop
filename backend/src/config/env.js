import dotenv from "dotenv";

dotenv.config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Variável de ambiente ${name} deve ser um inteiro`);
  }
  return parsed;
}

function list(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";

export const env = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === "test",
  port: int("PORT", 3000),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL ?? "",
  sessionSecret: isProduction
    ? required("SESSION_SECRET")
    : process.env.SESSION_SECRET ?? "dev-session-secret-change-me",
  adminTokenTtl: process.env.ADMIN_TOKEN_TTL ?? "12h",
  playerTokenTtl: process.env.PLAYER_TOKEN_TTL ?? "12h",
  // Origens permitidas. Em rede local aceitamos qualquer origem por padrao,
  // porque o IP do professor muda de sala para sala (spec 37).
  corsOrigins: list("CORS_ORIGINS", null),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",
  defaultRoundDuration: int("DEFAULT_ROUND_DURATION", 120),
  letterPool: process.env.LETTER_POOL ?? "ABCDEFGHIJLMNOPRSTUV",
  bootstrapAdmin: {
    email: process.env.ADMIN_EMAIL ?? "professor@stop.local",
    password: process.env.ADMIN_PASSWORD ?? "stop-admin",
    name: process.env.ADMIN_NAME ?? "Professor",
  },
  rateLimit: {
    windowMs: int("RATE_LIMIT_WINDOW_MS", 60_000),
    max: int("RATE_LIMIT_MAX", 300),
    authMax: int("RATE_LIMIT_AUTH_MAX", 20),
  },
};

export default env;
