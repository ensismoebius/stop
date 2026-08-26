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
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      reconnectionAttempts: Infinity,
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
