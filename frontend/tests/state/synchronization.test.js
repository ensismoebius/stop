import { describe, expect, it } from "vitest";
import { applyAuthoritative, compareStatePosition } from "../../src/state/synchronization.js";

describe("compareStatePosition", () => {
  it("orders by roomEpoch first", () => {
    expect(compareStatePosition({ roomEpoch: 2, stateVersion: 0 }, { roomEpoch: 1, stateVersion: 99 })).toBe(1);
    expect(compareStatePosition({ roomEpoch: 1, stateVersion: 99 }, { roomEpoch: 2, stateVersion: 0 })).toBe(-1);
  });

  it("orders by stateVersion within the same epoch", () => {
    expect(compareStatePosition({ roomEpoch: 1, stateVersion: 3 }, { roomEpoch: 1, stateVersion: 2 })).toBe(1);
    expect(compareStatePosition({ roomEpoch: 1, stateVersion: 1 }, { roomEpoch: 1, stateVersion: 2 })).toBe(-1);
  });

  it("treats equal positions as the same", () => {
    expect(compareStatePosition({ roomEpoch: 1, stateVersion: 4 }, { roomEpoch: 1, stateVersion: 4 })).toBe(0);
  });

  it("treats missing fields as the base position (0, 0)", () => {
    expect(compareStatePosition({}, { roomEpoch: 1, stateVersion: 0 })).toBe(-1);
    expect(compareStatePosition({ roomEpoch: 1, stateVersion: 0 }, {})).toBe(1);
    expect(compareStatePosition({}, undefined)).toBe(0);
  });
});

describe("applyAuthoritative", () => {
  it("adopts a newer versioned state and advances the position", () => {
    const current = { roomEpoch: 1, stateVersion: 0 };
    const incoming = {
      roomEpoch: 1,
      stateVersion: 2,
      round: { status: "PLAYING" },
    };
    const { adopted, position } = applyAuthoritative(current, incoming);
    expect(adopted).toBe(true);
    expect(position).toEqual({ roomEpoch: 1, stateVersion: 2 });
  });

  it("discards a delayed OLD state so it cannot regress the client", () => {
    const current = { roomEpoch: 1, stateVersion: 5 };
    const delayedOldPush = {
      roomEpoch: 1,
      stateVersion: 3,
      round: { status: "STOPPED" },
    };
    const { adopted, position } = applyAuthoritative(current, delayedOldPush);
    expect(adopted).toBe(false);
    expect(position).toEqual(current);
  });

  it("discards a state from an OLD room epoch (previous session) even with a higher version", () => {
    const current = { roomEpoch: 2, stateVersion: 0 };
    const staleEpochPush = { roomEpoch: 1, stateVersion: 99 };
    const { adopted, position } = applyAuthoritative(current, staleEpochPush);
    expect(adopted).toBe(false);
    expect(position).toEqual(current);
  });

  it("adopts a re-push of the SAME position (idempotent, not a regression)", () => {
    const current = { roomEpoch: 1, stateVersion: 4 };
    const samePositionPush = { roomEpoch: 1, stateVersion: 4, players: ["a"] };
    const { adopted, position } = applyAuthoritative(current, samePositionPush);
    expect(adopted).toBe(true);
    expect(position).toEqual(current);
  });

  it("adopts an unversioned authoritative snapshot preserving the current position", () => {
    const current = { roomEpoch: 3, stateVersion: 7 };
    const rawPush = { round: { status: "PLAYING" } };
    const { adopted, position } = applyAuthoritative(current, rawPush);
    expect(adopted).toBe(true);
    expect(position).toEqual(current);
  });

  it("adopts a first-ever unversioned snapshot with the default base position", () => {
    const { adopted, position } = applyAuthoritative(undefined, { round: { status: "READY" } });
    expect(adopted).toBe(true);
    expect(position).toEqual({ roomEpoch: 1, stateVersion: 0 });
  });

  it("treats a missing incoming snapshot as an empty unversioned adopt (position preserved)", () => {
    const current = { roomEpoch: 1, stateVersion: 1 };
    const { adopted, position } = applyAuthoritative(current, undefined);
    expect(adopted).toBe(true);
    expect(position).toEqual(current);
  });

  it("compares a partially-versioned snapshot honestly (missing version counts as 0)", () => {
    const { adopted, position } = applyAuthoritative({ roomEpoch: 1, stateVersion: 4 }, { roomEpoch: 1 });
    expect(adopted).toBe(false);
    expect(position).toEqual({ roomEpoch: 1, stateVersion: 4 });
  });
});