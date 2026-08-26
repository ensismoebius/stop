import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_LOG_LEVEL = process.env.LOG_LEVEL;

async function loadLogger() {
  vi.resetModules();
  const mod = await import("../../src/lib/logger.js");
  return mod.default;
}

afterEach(() => {
  if (ORIGINAL_LOG_LEVEL === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = ORIGINAL_LOG_LEVEL;
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("lib/logger", () => {
  it("com LOG_LEVEL=debug emite todos os niveis, cada um no console correto", async () => {
    process.env.LOG_LEVEL = "debug";
    const logger = await loadLogger();

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.error("falhou");
    logger.warn("cuidado");
    logger.info("info simples");
    logger.debug("detalhe");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    // debug usa console.log, nunca console.debug
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("inclui o metadado quando informado", async () => {
    process.env.LOG_LEVEL = "debug";
    const logger = await loadLogger();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const meta = { detail: "x" };
    logger.error("com meta", meta);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("ERROR com meta"), meta);
  });

  it("com LOG_LEVEL=error, mensagens de nivel inferior sao descartadas", async () => {
    process.env.LOG_LEVEL = "error";
    const logger = await loadLogger();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.warn("nao deveria aparecer");
    logger.info("nao deveria aparecer");
    logger.debug("nao deveria aparecer");
    logger.error("deveria aparecer");

    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("sem LOG_LEVEL definido, usa 'info' fora do ambiente de teste", async () => {
    delete process.env.LOG_LEVEL;
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    const logger = await loadLogger();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("padrao de producao/dev");
    logger.debug("abaixo do limite, descartado");

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
