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

// Valores padrao de desenvolvimento (inclusive os defaults do docker-compose).
// Em producao eles nunca devem chegar aqui sem terem sido trocados: um
// segredo ou senha de admin previsivel em producao e uma porta aberta.
const KNOWN_PLACEHOLDERS = {
  SESSION_SECRET: new Set(["change-me", "dev-session-secret-change-me"]),
  ADMIN_PASSWORD: new Set(["stop-admin"]),
};

function productionSecret(name, devFallback) {
  if (!isProduction) return process.env[name] ?? devFallback;
  const value = required(name);
  if (KNOWN_PLACEHOLDERS[name]?.has(value)) {
    throw new Error(
      `Variável de ambiente ${name} está usando um valor padrão de desenvolvimento em produção. Defina um valor real e único.`,
    );
  }
  return value;
}

export const env = {
  nodeEnv,
  isProduction,
  isTest: nodeEnv === "test",
  port: int("PORT", 3000),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL ?? "",
  sessionSecret: productionSecret("SESSION_SECRET", "dev-session-secret-change-me"),
  adminTokenTtl: process.env.ADMIN_TOKEN_TTL ?? "12h",
  playerTokenTtl: process.env.PLAYER_TOKEN_TTL ?? "12h",
  // Origens permitidas. Em rede local aceitamos qualquer origem por padrao,
  // porque o IP do professor muda de sala para sala (spec 37).
  corsOrigins: list("CORS_ORIGINS", null),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",
  defaultRoundDuration: int("DEFAULT_ROUND_DURATION", 120),
  letterPool: process.env.LETTER_POOL ?? "ABCDEFGHIJLMNOPRSTUV",
  // Sincronizacao da revelacao da letra (enhancements: correcao colaborativa,
  // secoes 4-7 e 54). Em teste, os tres colapsam para 0 para nao pagar a
  // duracao real da animacao/contagem em cada teste de integracao.
  letterRevealAnimationMs: int("LETTER_REVEAL_ANIMATION_MS", nodeEnv === "test" ? 0 : 3400),
  countdownAckTimeoutMs: int("COUNTDOWN_ACK_TIMEOUT_MS", nodeEnv === "test" ? 0 : 1500),
  countdownDurationMs: int("COUNTDOWN_DURATION_MS", nodeEnv === "test" ? 0 : 3000),
  // Correcao colaborativa entre alunos (secoes 9-14 e 27-29).
  collaborativeReviewCount: int("COLLABORATIVE_REVIEW_COUNT", 8),
  collaborativeReviewBonus: int("COLLABORATIVE_REVIEW_BONUS", 2),
  collaborativeCorrectionDurationSeconds: int("COLLABORATIVE_CORRECTION_DURATION_SECONDS", 60),
  bootstrapAdmin: {
    email: process.env.ADMIN_EMAIL ?? "professor@stop.local",
    password: productionSecret("ADMIN_PASSWORD", "stop-admin"),
    name: process.env.ADMIN_NAME ?? "Professor",
  },
  rateLimit: {
    windowMs: int("RATE_LIMIT_WINDOW_MS", 60_000),
    max: int("RATE_LIMIT_MAX", 300),
    authMax: int("RATE_LIMIT_AUTH_MAX", 20),
  },
};

export default env;
