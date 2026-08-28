import { afterEach, describe, expect, it, vi } from "vitest";

// dotenv.config() leria o .env real do repositório e reencheria variáveis
// que os testes abaixo deliberadamente removem de process.env (dotenv só
// preenche o que ainda não está definido). Mockado para que cada teste
// controle com precisão o que está e o que não está definido.
vi.mock("dotenv", () => ({ default: { config: vi.fn() }, config: vi.fn() }));

const ORIGINAL_ENV = { ...process.env };

/** Restaura o process.env original vazio/criado pelos testes. */
function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

/** Recarrega o módulo de env com os mocks em vigor e devolve-o. */
async function loadEnv() {
  vi.resetModules();
  const mod = await import("../../src/config/env.js");
  return mod.env;
}

afterEach(() => {
  restoreEnv();
  vi.resetModules();
});

describe("config/env (validação de variáveis de ambiente)", () => {
  it("interpreta CORS_ORIGINS como lista separada por vírgula, ignorando vazios", async () => {
    process.env.CORS_ORIGINS = "http://a.com, http://b.com ,,";
    const env = await loadEnv();
    expect(env.corsOrigins).toEqual(["http://a.com", "http://b.com"]);
  });

  it("CORS_ORIGINS vazio ou ausente cai no padrão (qualquer origem em rede local)", async () => {
    delete process.env.CORS_ORIGINS;
    const env = await loadEnv();
    expect(env.corsOrigins).toBeNull();
  });

  it("lança erro quando uma variável inteira não é um número válido", async () => {
    process.env.PORT = "não-é-um-número";
    await expect(loadEnv()).rejects.toThrow(/deve ser um inteiro/);
  });

  it("usa a porta informada quando é um inteiro válido", async () => {
    process.env.PORT = "4567";
    const env = await loadEnv();
    expect(env.port).toBe(4567);
  });

  it("usa o padrão da porta (3000) quando PORT não está definida", async () => {
    delete process.env.PORT;
    const env = await loadEnv();
    expect(env.port).toBe(3000);
  });

  it("NODE_ENV ausente assume 'development'", async () => {
    delete process.env.NODE_ENV;
    const env = await loadEnv();
    expect(env.nodeEnv).toBe("development");
    expect(env.isProduction).toBe(false);
    expect(env.isTest).toBe(false);
  });

  it("fora do ambiente de teste usa a duração real da revelação/contagem", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.LETTER_REVEAL_ANIMATION_MS;
    delete process.env.COUNTDOWN_ACK_TIMEOUT_MS;
    delete process.env.COUNTDOWN_DURATION_MS;
    const env = await loadEnv();
    expect(env.isTest).toBe(false);
    expect(env.isProduction).toBe(false);
    expect(env.letterRevealAnimationMs).toBe(3400);
    expect(env.countdownAckTimeoutMs).toBe(1500);
    expect(env.countdownDurationMs).toBe(3000);
  });

  it("usa os valores customizados quando as variáveis opcionais estão definidas", async () => {
    process.env.HOST = "127.0.0.1";
    process.env.DATABASE_URL = "mysql://custom";
    process.env.ADMIN_TOKEN_TTL = "1h";
    process.env.PLAYER_TOKEN_TTL = "2h";
    process.env.PUBLIC_BASE_URL = "https://stop.example.com";
    process.env.LETTER_POOL = "ABC";
    process.env.ADMIN_EMAIL = "outro@stop.local";
    process.env.ADMIN_NAME = "Outro Nome";
    const env = await loadEnv();
    expect(env.host).toBe("127.0.0.1");
    expect(env.databaseUrl).toBe("mysql://custom");
    expect(env.adminTokenTtl).toBe("1h");
    expect(env.playerTokenTtl).toBe("2h");
    expect(env.publicBaseUrl).toBe("https://stop.example.com");
    expect(env.letterPool).toBe("ABC");
    expect(env.bootstrapAdmin.email).toBe("outro@stop.local");
    expect(env.bootstrapAdmin.name).toBe("Outro Nome");
  });

  it("usa os fallbacks quando as variáveis opcionais não estão definidas", async () => {
    delete process.env.HOST;
    delete process.env.DATABASE_URL;
    delete process.env.ADMIN_TOKEN_TTL;
    delete process.env.PLAYER_TOKEN_TTL;
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.LETTER_POOL;
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_NAME;
    const env = await loadEnv();
    expect(env.host).toBe("0.0.0.0");
    expect(env.databaseUrl).toBe("");
    expect(env.adminTokenTtl).toBe("12h");
    expect(env.playerTokenTtl).toBe("12h");
    expect(env.publicBaseUrl).toBe("");
    expect(env.letterPool).toBe("ABCDEFGHIJLMNOPRSTUV");
    expect(env.bootstrapAdmin.email).toBe("professor@stop.local");
    expect(env.bootstrapAdmin.name).toBe("Professor");
  });

  it("fora de produção, SESSION_SECRET/ADMIN_PASSWORD ausentes usam o fallback de desenvolvimento", async () => {
    delete process.env.SESSION_SECRET;
    delete process.env.ADMIN_PASSWORD;
    const env = await loadEnv();
    expect(env.sessionSecret).toBe("dev-session-secret-change-me");
    expect(env.bootstrapAdmin.password).toBe("stop-admin");
  });

  it("em produção exige SESSION_SECRET definido", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.SESSION_SECRET;
    await expect(loadEnv()).rejects.toThrow(
      /Variável de ambiente obrigatória ausente: SESSION_SECRET/,
    );
  });

  it("em produção rejeita SESSION_SECRET com valor padrão de desenvolvimento", async () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "change-me";
    await expect(loadEnv()).rejects.toThrow(/valor padrão de desenvolvimento em produção/);
  });

  it("em produção rejeita ADMIN_PASSWORD igual ao padrão", async () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "segredo-real-bem-unico";
    process.env.ADMIN_PASSWORD = "stop-admin";
    await expect(loadEnv()).rejects.toThrow(/valor padrão de desenvolvimento em produção/);
  });

  it("em produção aceita segredos reais e distintos dos padrões", async () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "segredo-real-bem-unico";
    process.env.ADMIN_PASSWORD = "senha-real-bem-unica";
    const env = await loadEnv();
    expect(env.isProduction).toBe(true);
    expect(env.sessionSecret).toBe("segredo-real-bem-unico");
    expect(env.bootstrapAdmin.password).toBe("senha-real-bem-unica");
  });
});
