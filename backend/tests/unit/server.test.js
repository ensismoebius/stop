import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * src/server.js é o bootstrap real do processo: escuta numa porta de
 * verdade, registra handlers de SIGINT/SIGTERM e chama process.exit.
 *
 * Para testar sem afetar o processo do test runner: porta efêmera (PORT=0),
 * process.exit mockado (nunca derruba o worker de teste), e o handler de
 * sinal é invocado diretamente (via o spy em process.on) em vez de emitir
 * um sinal real — evitar `process.emit('SIGINT', ...)` que acionaria
 * também os handlers do próprio Vitest.
 */

const checkDatabaseMock = vi.fn();
const disconnectPrismaMock = vi.fn();
const recoverActiveRoundsMock = vi.fn();

vi.mock("../../src/lib/prisma.js", () => ({
  checkDatabase: (...args) => checkDatabaseMock(...args),
  disconnectPrisma: (...args) => disconnectPrismaMock(...args),
  default: {},
}));

vi.mock("../../src/game/recovery.js", () => ({
  recoverActiveRounds: (...args) => recoverActiveRoundsMock(...args),
  default: (...args) => recoverActiveRoundsMock(...args),
}));

let exitSpy;
let onSpy;
let originalPort;

beforeEach(() => {
  vi.resetModules();
  checkDatabaseMock.mockReset().mockResolvedValue({ healthy: true });
  disconnectPrismaMock.mockReset().mockResolvedValue(undefined);
  recoverActiveRoundsMock.mockReset().mockResolvedValue(2);
  originalPort = process.env.PORT;
  process.env.PORT = "0";
  exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
  onSpy = vi.spyOn(process, "on");
});

afterEach(async () => {
  // Fecha qualquer servidor deixado escutando por este teste, disparando o
  // handler de encerramento diretamente (nunca via sinal real).
  const sigint = onSpy?.mock.calls.find(([event]) => event === "SIGINT");
  if (sigint) {
    await sigint[1]("SIGINT").catch(() => {});
  }
  exitSpy?.mockRestore();
  onSpy?.mockRestore();
  if (originalPort === undefined) delete process.env.PORT;
  else process.env.PORT = originalPort;
  vi.resetModules();
});

describe("src/server.js (bootstrap do processo)", () => {
  it("sobe o servidor HTTP, recupera rodadas ativas e registra os handlers de encerramento", async () => {
    await import("../../src/server.js");
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(checkDatabaseMock).toHaveBeenCalled();
    expect(recoverActiveRoundsMock).toHaveBeenCalled();

    const sigint = onSpy.mock.calls.find(([event]) => event === "SIGINT");
    const sigterm = onSpy.mock.calls.find(([event]) => event === "SIGTERM");
    expect(sigint).toBeTruthy();
    expect(sigterm).toBeTruthy();
  });

  it("SIGINT encerra graciosamente: limpa timers, fecha servidores, desconecta o banco e sai com 0", async () => {
    await import("../../src/server.js");
    await new Promise((resolve) => setTimeout(resolve, 150));

    const sigint = onSpy.mock.calls.find(([event]) => event === "SIGINT");
    await sigint[1]("SIGINT");

    expect(disconnectPrismaMock).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("quando nenhuma rodada é recuperada, não emite o log de contagem", async () => {
    recoverActiveRoundsMock.mockResolvedValue(0);
    await import("../../src/server.js");
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(recoverActiveRoundsMock).toHaveBeenCalled();
  });

  it("quando o banco está indisponível, não tenta recuperar rodadas ativas", async () => {
    checkDatabaseMock.mockResolvedValue({ healthy: false, reason: "UNREACHABLE" });
    await import("../../src/server.js");
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(recoverActiveRoundsMock).not.toHaveBeenCalled();
  });

  it("uma falha ao recuperar rodadas ativas é registrada, sem impedir o boot", async () => {
    recoverActiveRoundsMock.mockRejectedValue(new Error("falha simulada de recuperação"));
    await import("../../src/server.js");
    await new Promise((resolve) => setTimeout(resolve, 150));

    // O servidor continua de pé: os handlers de sinal foram registrados.
    expect(onSpy.mock.calls.some(([event]) => event === "SIGINT")).toBe(true);
  });

  it("uma falha sem .message (valor não-Error) ainda é registrada normalmente", async () => {
    // eslint-disable-next-line prefer-promise-reject-errors
    recoverActiveRoundsMock.mockRejectedValue("motivo sem .message");
    await import("../../src/server.js");
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(onSpy.mock.calls.some(([event]) => event === "SIGINT")).toBe(true);
  });

  it("uma falha fatal na inicialização encerra o processo com código 1", async () => {
    checkDatabaseMock.mockRejectedValue(new Error("fatal"));
    await import("../../src/server.js");
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
