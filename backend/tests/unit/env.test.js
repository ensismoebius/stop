import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

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

  it("CORS_ORIGINS vazio cai no padrão (qualquer origem em rede local)", async () => {
    process.env.CORS_ORIGINS = "";
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

  it("em produção exige SESSION_SECRET definido", async () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "";
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
