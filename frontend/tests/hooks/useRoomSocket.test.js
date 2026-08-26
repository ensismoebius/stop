import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRoomSocket } from "../../src/hooks/useRoomSocket.js";
import { createSocket, emitAck } from "../../src/socket/socket.js";

vi.mock("../../src/socket/socket.js", () => ({
  createSocket: vi.fn(),
  emitAck: vi.fn(),
}));

/** Minimal fake Socket.IO client instance that records `.on()` handlers. */
function createFakeSocket() {
  const handlers = new Map();
  return {
    on: vi.fn((event, handler) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    }),
    removeAllListeners: vi.fn(),
    close: vi.fn(),
    emit: vi.fn(),
    trigger(event, ...args) {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
  };
}

beforeEach(() => {
  createSocket.mockReset();
  emitAck.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useRoomSocket", () => {
  it("does not connect when disabled", () => {
    renderHook(() =>
      useRoomSocket({ roomCode: "ABCD", role: "player", playerToken: "t1", enabled: false }),
    );
    expect(createSocket).not.toHaveBeenCalled();
  });

  it("does not connect without a roomCode", () => {
    renderHook(() => useRoomSocket({ roomCode: null, role: "player", playerToken: "t1" }));
    expect(createSocket).not.toHaveBeenCalled();
  });

  it("does not connect as a player without a playerToken", () => {
    renderHook(() => useRoomSocket({ roomCode: "ABCD", role: "player", playerToken: null }));
    expect(createSocket).not.toHaveBeenCalled();
  });

  it("does not connect as a teacher without an adminToken", () => {
    renderHook(() => useRoomSocket({ roomCode: "ABCD", role: "teacher", adminToken: null }));
    expect(createSocket).not.toHaveBeenCalled();
  });

  it("connects, joins on connect, and adopts the server state", async () => {
    const socket = createFakeSocket();
    createSocket.mockReturnValue(socket);
    emitAck.mockResolvedValue({ ok: true, data: { players: [] } });
    const onState = vi.fn();
    const onJoined = vi.fn();

    const { result } = renderHook(() =>
      useRoomSocket({
        roomCode: "ABCD",
        role: "player",
        playerToken: "tok",
        handlers: { onState, onJoined },
      }),
    );

    expect(createSocket).toHaveBeenCalledTimes(1);
    expect(result.current.socket).toBe(socket);

    await act(async () => {
      socket.trigger("connect");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(emitAck).toHaveBeenCalledWith(socket, "joinRoom", {
      roomCode: "ABCD",
      role: "player",
      playerToken: "tok",
      adminToken: undefined,
    });
    expect(result.current.connected).toBe(true);
    expect(result.current.state).toEqual({ players: [] });
    expect(result.current.error).toBeNull();
    expect(onState).toHaveBeenCalledWith({ players: [] });
    expect(onJoined).toHaveBeenCalledWith({ players: [] });
  });

  it("sets an error when the join ack fails", async () => {
    const socket = createFakeSocket();
    createSocket.mockReturnValue(socket);
    emitAck.mockResolvedValue({ ok: false, error: { code: "ROOM_NOT_FOUND" } });

    const { result } = renderHook(() =>
      useRoomSocket({ roomCode: "ABCD", role: "player", playerToken: "tok" }),
    );

    await act(async () => {
      socket.trigger("connect");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.error).toEqual({ code: "ROOM_NOT_FOUND" });
  });

  it("tracks disconnects and connect_error", async () => {
    const socket = createFakeSocket();
    createSocket.mockReturnValue(socket);
    emitAck.mockResolvedValue({ ok: true, data: {} });

    const { result } = renderHook(() =>
      useRoomSocket({ roomCode: "ABCD", role: "player", playerToken: "tok" }),
    );

    await act(async () => {
      socket.trigger("connect");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.connected).toBe(true);

    act(() => socket.trigger("disconnect"));
    expect(result.current.connected).toBe(false);

    act(() => socket.trigger("connect_error"));
    expect(result.current.error).toEqual({
      code: "CONNECT_ERROR",
      message: "Sem conexao com o servidor",
    });
  });

  it("updates state and calls onState on a pushed roomState event", () => {
    const socket = createFakeSocket();
    createSocket.mockReturnValue(socket);
    emitAck.mockResolvedValue({ ok: true, data: {} });
    const onState = vi.fn();

    const { result } = renderHook(() =>
      useRoomSocket({
        roomCode: "ABCD",
        role: "player",
        playerToken: "tok",
        handlers: { onState },
      }),
    );

    act(() => socket.trigger("roomState", { round: 2 }));
    expect(result.current.state).toEqual({ round: 2 });
    expect(onState).toHaveBeenCalledWith({ round: 2 });
  });

  it("calls onError on a pushed error event", () => {
    const socket = createFakeSocket();
    createSocket.mockReturnValue(socket);
    emitAck.mockResolvedValue({ ok: true, data: {} });
    const onError = vi.fn();

    renderHook(() =>
      useRoomSocket({
        roomCode: "ABCD",
        role: "player",
        playerToken: "tok",
        handlers: { onError },
      }),
    );

    act(() => socket.trigger("error", { code: "BOOM" }));
    expect(onError).toHaveBeenCalledWith({ code: "BOOM" });
  });

  it("acks syncCountdownRequested automatically after invoking the handler", () => {
    const socket = createFakeSocket();
    createSocket.mockReturnValue(socket);
    emitAck.mockResolvedValue({ ok: true, data: {} });
    const syncCountdownRequested = vi.fn();
    const ack = vi.fn();

    renderHook(() =>
      useRoomSocket({
        roomCode: "ABCD",
        role: "player",
        playerToken: "tok",
        handlers: { syncCountdownRequested },
      }),
    );

    act(() => socket.trigger("syncCountdownRequested", { serverTime: "now" }, ack));
    expect(syncCountdownRequested).toHaveBeenCalledWith({ serverTime: "now" });
    expect(ack).toHaveBeenCalledWith(true);
  });

  it("handles syncCountdownRequested with no ack function provided", () => {
    const socket = createFakeSocket();
    createSocket.mockReturnValue(socket);
    emitAck.mockResolvedValue({ ok: true, data: {} });

    renderHook(() =>
      useRoomSocket({ roomCode: "ABCD", role: "player", playerToken: "tok" }),
    );

    expect(() => socket.trigger("syncCountdownRequested", { serverTime: "now" })).not.toThrow();
  });

  it("forwards named events 1:1 to their handlers", () => {
    const socket = createFakeSocket();
    createSocket.mockReturnValue(socket);
    emitAck.mockResolvedValue({ ok: true, data: {} });
    const playerJoined = vi.fn();
    const rankingUpdated = vi.fn();

    renderHook(() =>
      useRoomSocket({
        roomCode: "ABCD",
        role: "player",
        playerToken: "tok",
        handlers: { playerJoined, rankingUpdated },
      }),
    );

    act(() => {
      socket.trigger("playerJoined", { id: 1 });
      socket.trigger("rankingUpdated", { ranking: [] });
    });
    expect(playerJoined).toHaveBeenCalledWith({ id: 1 });
    expect(rankingUpdated).toHaveBeenCalledWith({ ranking: [] });
  });

  it("does not throw when a named event fires with no matching handler registered", () => {
    const socket = createFakeSocket();
    createSocket.mockReturnValue(socket);
    emitAck.mockResolvedValue({ ok: true, data: {} });

    renderHook(() => useRoomSocket({ roomCode: "ABCD", role: "player", playerToken: "tok" }));
    expect(() => socket.trigger("roundStarted", {})).not.toThrow();
  });

  it("connects as a teacher when adminToken is provided", () => {
    const socket = createFakeSocket();
    createSocket.mockReturnValue(socket);
    emitAck.mockResolvedValue({ ok: true, data: {} });

    renderHook(() =>
      useRoomSocket({ roomCode: "ABCD", role: "teacher", adminToken: "admin-tok" }),
    );
    expect(createSocket).toHaveBeenCalledTimes(1);
  });

  it("tears down listeners and closes the socket on unmount / dependency change", () => {
    const socket = createFakeSocket();
    createSocket.mockReturnValue(socket);
    emitAck.mockResolvedValue({ ok: true, data: {} });

    const { unmount } = renderHook(() =>
      useRoomSocket({ roomCode: "ABCD", role: "player", playerToken: "tok" }),
    );
    unmount();
    expect(socket.removeAllListeners).toHaveBeenCalledTimes(1);
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("reconnects with a fresh socket when roomCode changes", () => {
    const socketA = createFakeSocket();
    const socketB = createFakeSocket();
    createSocket.mockReturnValueOnce(socketA).mockReturnValueOnce(socketB);
    emitAck.mockResolvedValue({ ok: true, data: {} });

    const { rerender } = renderHook(
      ({ roomCode }) => useRoomSocket({ roomCode, role: "player", playerToken: "tok" }),
      { initialProps: { roomCode: "AAAA" } },
    );
    rerender({ roomCode: "BBBB" });

    expect(socketA.removeAllListeners).toHaveBeenCalledTimes(1);
    expect(socketA.close).toHaveBeenCalledTimes(1);
    expect(createSocket).toHaveBeenCalledTimes(2);
  });
});
