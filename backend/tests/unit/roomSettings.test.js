import { beforeEach, describe, expect, it } from "vitest";
import {
  getRoomSettings,
  applyRoomSettings,
  dropRoomSettings,
} from "../../src/services/room/roomSettings.js";

const ROOM = "STOP-SETTINGS";

beforeEach(() => {
  dropRoomSettings(ROOM);
});

describe("roomSettings", () => {
  it("devolve os defaults quando a sala nunca foi ajustada", () => {
    expect(getRoomSettings(ROOM)).toEqual({ hidePoints: false, volume: 0.65, muted: false });
  });

  it("um PATCH parcial preserva os demais campos com valor válido", () => {
    // A UI manda exatamente isto ao ligar o interruptor: só o campo alterado.
    // Antes, o merge partia de `{}` e o resultado saía sem `volume`/`muted` —
    // a tela pública passava a receber `volume: undefined` e o controle de
    // áudio virava NaN.
    const next = applyRoomSettings(ROOM, { hidePoints: true });
    expect(next).toEqual({ hidePoints: true, volume: 0.65, muted: false });
    expect(getRoomSettings(ROOM)).toEqual({ hidePoints: true, volume: 0.65, muted: false });
  });

  it("acumula PATCHes sucessivos sem perder o que já estava ajustado", () => {
    applyRoomSettings(ROOM, { volume: 0.2 });
    applyRoomSettings(ROOM, { hidePoints: true });
    expect(getRoomSettings(ROOM)).toEqual({ hidePoints: true, volume: 0.2, muted: false });
  });

  it("normaliza tipos: volume fora da faixa é limitado e flags viram boolean", () => {
    expect(applyRoomSettings(ROOM, { volume: 5 }).volume).toBe(1);
    expect(applyRoomSettings(ROOM, { volume: -3 }).volume).toBe(0);
    expect(applyRoomSettings(ROOM, { volume: Number.NaN }).volume).toBe(0.65);
    expect(applyRoomSettings(ROOM, { hidePoints: "sim" }).hidePoints).toBe(true);
    expect(applyRoomSettings(ROOM, { muted: 1 }).muted).toBe(true);
  });

  it("dropRoomSettings devolve a sala aos defaults (sala encerrada não vaza ajuste)", () => {
    applyRoomSettings(ROOM, { hidePoints: true, volume: 0.1 });
    dropRoomSettings(ROOM);
    expect(getRoomSettings(ROOM)).toEqual({ hidePoints: false, volume: 0.65, muted: false });
  });
});
