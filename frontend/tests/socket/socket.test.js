import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ioMock = vi.fn();

vi.mock("socket.io-client", () => ({
  io: (...args) => ioMock(...args),
}));

beforeEach(() => {
  vi.resetModules();
  ioMock.mockReset();
});

describe("createSocket", () => {
  it("connects with websocket+polling transports and infinite reconnection", async () => {
    const fakeInstance = { id: "socket-1" };
    ioMock.mockReturnValue(fakeInstance);
    const { createSocket } = await import("../../src/socket/socket.js");

    const result = createSocket();

    expect(result).toBe(fakeInstance);
    expect(ioMock).toHaveBeenCalledTimes(1);
    const [url, options] = ioMock.mock.calls[0];
    expect(url).toBeUndefined();
    expect(options).toMatchObject({
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: Infinity,
      randomizationFactor: 0.7,
      autoConnect: true,
    });
  });
});

describe("emitAck", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the server's ack response", async () => {
    const { emitAck } = await import("../../src/socket/socket.js");
    const socket = {
      emit: (event, payload, cb) => cb({ ok: true, data: { foo: "bar" } }),
    };
    const result = await emitAck(socket, "joinRoom", { roomCode: "ABC" });
    expect(result).toEqual({ ok: true, data: { foo: "bar" } });
  });

  it("resolves with an EMPTY error when the ack response is falsy", async () => {
    const { emitAck } = await import("../../src/socket/socket.js");
    const socket = {
      emit: (event, payload, cb) => cb(undefined),
    };
    const result = await emitAck(socket, "joinRoom", {});
    expect(result).toEqual({ ok: false, error: { code: "EMPTY", message: "Resposta vazia" } });
  });

  it("times out when the server never acks", async () => {
    const { emitAck } = await import("../../src/socket/socket.js");
    const socket = { emit: vi.fn() };
    const promise = emitAck(socket, "joinRoom", {}, 8000);
    await vi.advanceTimersByTimeAsync(8000);
    const result = await promise;
    expect(result).toEqual({
      ok: false,
      error: { code: "TIMEOUT", message: "Sem resposta do servidor" },
    });
  });

  it("ignores a late ack that arrives after the timeout already settled", async () => {
    const { emitAck } = await import("../../src/socket/socket.js");
    let ackCallback;
    const socket = {
      emit: (event, payload, cb) => {
        ackCallback = cb;
      },
    };
    const promise = emitAck(socket, "joinRoom", {}, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.error.code).toBe("TIMEOUT");

    // Late ack after timeout must not throw and must be a no-op.
    expect(() => ackCallback({ ok: true, data: {} })).not.toThrow();
  });

  it("ignores a timeout firing after the ack already settled", async () => {
    const { emitAck } = await import("../../src/socket/socket.js");
    const socket = {
      emit: (event, payload, cb) => cb({ ok: true, data: {} }),
    };
    const promise = emitAck(socket, "joinRoom", {}, 8000);
    const result = await promise;
    expect(result.ok).toBe(true);
    // Advance past the timeout window; the already-cleared timer must not
    // resolve again (the promise already settled).
    await vi.advanceTimersByTimeAsync(8000);
  });

  it("the timeout callback itself is a no-op if it still manages to fire after settling", async () => {
    // Normally clearTimeout() prevents this, but the callback guards
    // against it independently — simulate that race by neutering
    // clearTimeout so the scheduled timer still runs.
    const { emitAck } = await import("../../src/socket/socket.js");
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout").mockImplementation(() => {});
    const socket = {
      emit: (event, payload, cb) => cb({ ok: true, data: { already: "settled" } }),
    };
    const promise = emitAck(socket, "joinRoom", {}, 1000);
    const result = await promise;
    expect(result).toEqual({ ok: true, data: { already: "settled" } });

    // The un-cleared timer now fires; its own "already settled" guard
    // must stop it from resolving/rejecting again.
    await expect(vi.advanceTimersByTimeAsync(1000)).resolves.not.toThrow();
    clearTimeoutSpy.mockRestore();
  });
});

describe("emitCommand", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("attaches a fresh operationId and resolves on the first ack", async () => {
    const { emitCommand } = await import("../../src/socket/socket.js");
    const socket = {
      emit: vi.fn((event, payload, cb) => cb({ ok: true, data: { applied: true } })),
    };

    const result = await emitCommand(socket, "ready", { roundId: 7 });

    expect(result).toEqual({ ok: true, data: { applied: true } });
    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit.mock.calls[0][0]).toBe("ready");
    const payload = socket.emit.mock.calls[0][1];
    expect(payload.roundId).toBe(7);
    expect(payload.operationId).toBeTypeOf("string");
    expect(payload.operationId.length).toBeGreaterThan(0);
  });

  it("resends a timed-out command with the SAME operationId and succeeds on the retry", async () => {
    const { emitCommand } = await import("../../src/socket/socket.js");
    const socket = {
      emit: vi.fn((event, payload, cb) => {
        // Primeira tentativa: ack perdido. Segunda: sucesso (idempotente).
        if (socket.emit.mock.calls.length === 2) cb({ ok: true, data: { applied: true } });
      }),
    };

    const promise = emitCommand(socket, "requestStop", { roundId: 9 }, { timeout: 1000, retryDelay: 100 });
    await vi.advanceTimersByTimeAsync(1000); // 1a tentativa estoura
    expect(socket.emit).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200); // sleep(retryDelay) -> 2a tentativa

    const result = await promise;
    expect(result).toEqual({ ok: true, data: { applied: true } });
    expect(socket.emit).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = socket.emit.mock.calls;
    expect(secondCall[1]).toEqual(firstCall[1]); // mesmo payload
    expect(secondCall[1].operationId).toBe(firstCall[1].operationId); // mesmo id
  });

  it("does NOT retry when the server rejects for a reason other than TIMEOUT", async () => {
    const { emitCommand } = await import("../../src/socket/socket.js");
    const socket = {
      emit: vi.fn((event, payload, cb) =>
        cb({ ok: false, error: { code: "NOT_READY", message: "Rodada nao iniciada" } }),
      ),
    };

    const result = await emitCommand(socket, "submitAnswer", { categoryId: 1 }, { timeout: 1000 });

    expect(result).toMatchObject({ ok: false, error: { code: "NOT_READY" } });
    expect(socket.emit).toHaveBeenCalledTimes(1);
  });

  it("uses a distinct operationId for distinct commands", async () => {
    const { emitCommand } = await import("../../src/socket/socket.js");
    const socket = { emit: vi.fn((event, payload, cb) => cb({ ok: true, data: {} })) };

    await emitCommand(socket, "ready", {});
    await emitCommand(socket, "ready", {});

    const [firstCall, secondCall] = socket.emit.mock.calls;
    expect(firstCall[1].operationId).not.toBe(secondCall[1].operationId);
  });
});

describe("createOperationId", () => {
  it("returns a distinct identifier on every call", async () => {
    const { createOperationId } = await import("../../src/socket/socket.js");
    expect(createOperationId()).not.toBe(createOperationId());
  });
});
