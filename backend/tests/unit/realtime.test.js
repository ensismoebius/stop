import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRealtime() {
  vi.resetModules();
  return import("../../src/sockets/realtime.js");
}

afterEach(() => {
  vi.resetModules();
});

describe("sockets/realtime (ponte com o Socket.IO)", () => {
  it("getIo devolve a instancia registrada por setIo", async () => {
    const realtime = await loadRealtime();
    expect(realtime.getIo()).toBeNull();
    const fakeIo = { to: vi.fn(() => ({ emit: vi.fn() })) };
    realtime.setIo(fakeIo);
    expect(realtime.getIo()).toBe(fakeIo);
  });

  it("requestAck resolve imediatamente quando o Socket.IO ainda nao esta disponivel", async () => {
    const realtime = await loadRealtime();
    // Modulo recem-carregado: io ainda nao foi definido.
    const result = await realtime.requestAck("sala", "evento", {}, 100);
    expect(result).toEqual({ acked: 0, total: 0, timedOut: false });
  });

  it("emit sem io registrado nao lanca e simplesmente descarta o evento", async () => {
    const realtime = await loadRealtime();
    expect(() => realtime.toRoom("STOP-TEST", "algumEvento", {})).not.toThrow();
    expect(() => realtime.toPlayers("STOP-TEST", "algumEvento", {})).not.toThrow();
  });

  it("toRoom/toTeachers/toScreens/toPlayer emitem para as salas corretas quando io existe", async () => {
    const realtime = await loadRealtime();
    const emitted = [];
    const fakeIo = { to: (target) => ({ emit: (event, payload) => emitted.push({ target, event, payload }) }) };
    realtime.setIo(fakeIo);

    realtime.toRoom("STOP-TEST", "roomEvent", { a: 1 });
    realtime.toTeachers("STOP-TEST", "teacherEvent", { b: 2 });
    realtime.toScreens("STOP-TEST", "screenEvent", { c: 3 });
    realtime.toPlayer(42, "playerEvent", { d: 4 });

    expect(emitted).toEqual([
      { target: "room:STOP-TEST", event: "roomEvent", payload: { a: 1 } },
      { target: "room:STOP-TEST:teachers", event: "teacherEvent", payload: { b: 2 } },
      { target: "room:STOP-TEST:screen", event: "screenEvent", payload: { c: 3 } },
      { target: "player:42", event: "playerEvent", payload: { d: 4 } },
    ]);
  });

  it("requestAck resolve com o resumo de acks quando io existe", async () => {
    const realtime = await loadRealtime();
    const fakeIo = {
      in: () => ({
        timeout: () => ({
          emit: (event, payload, cb) => cb(null, [true, false, true]),
        }),
      }),
    };
    realtime.setIo(fakeIo);
    const result = await realtime.requestAck("sala", "evento", {}, 100);
    expect(result).toEqual({ acked: 2, total: 3, timedOut: false });
  });

  it("requestAck marca timedOut quando o ack expira", async () => {
    const realtime = await loadRealtime();
    const fakeIo = {
      in: () => ({
        timeout: () => ({
          emit: (event, payload, cb) => cb(new Error("timeout"), undefined),
        }),
      }),
    };
    realtime.setIo(fakeIo);
    const result = await realtime.requestAck("sala", "evento", {}, 100);
    expect(result).toEqual({ acked: 0, total: 0, timedOut: true });
  });
});
