import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn();

vi.mock("../../src/lib/prisma.js", () => ({
  default: { round: { findMany: (...args) => findManyMock(...args) } },
}));

const scheduleRoundEndMock = vi.fn();
vi.mock("../../src/game/timers.js", () => ({
  scheduleRoundEnd: (...args) => scheduleRoundEndMock(...args),
}));

const handleTimeoutMock = vi.fn().mockResolvedValue(undefined);
const closeCollaborativeCorrectionMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../src/services/roundService.js", () => ({
  default: {
    handleTimeout: (...args) => handleTimeoutMock(...args),
  },
}));

const beginPlayingMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../src/services/round/lifecycle.js", () => ({
  beginPlaying: (...args) => beginPlayingMock(...args),
}));

const scheduleCollabTimeoutMock = vi.fn();
vi.mock("../../src/services/round/collaborativeCorrection.js", () => ({
  scheduleCollaborativeCorrectionTimeout: (...args) => scheduleCollabTimeoutMock(...args),
}));

// roundService.closeCollaborativeCorrection é acessado através do mock acima
// (default export), então também expomos aqui para as asserções.
import roundService from "../../src/services/roundService.js";
import { recoverActiveRounds } from "../../src/game/recovery.js";

function byStatus(fixtures) {
  return async ({ where }) => fixtures[where.status] ?? [];
}

beforeEach(() => {
  vi.clearAllMocks();
  handleTimeoutMock.mockResolvedValue(undefined);
  beginPlayingMock.mockResolvedValue(undefined);
  roundService.closeCollaborativeCorrection = closeCollaborativeCorrectionMock;
});

describe("game/recovery (retomada de temporizadores após reinício)", () => {
  it("rodada PLAYING já expirada é encerrada via handleTimeout, sem reagendar", async () => {
    findManyMock.mockImplementation(
      byStatus({
        PLAYING: [{ id: 1, endsAt: new Date(Date.now() - 5000) }],
        STARTING: [],
        COLLABORATIVE_CORRECTION: [],
      }),
    );

    const count = await recoverActiveRounds();

    expect(handleTimeoutMock).toHaveBeenCalledWith(1);
    expect(scheduleRoundEndMock).not.toHaveBeenCalled();
    expect(count).toBe(1);
  });

  it("rodada PLAYING sem endsAt é tratada como expirada (fallback ?? 0)", async () => {
    findManyMock.mockImplementation(
      byStatus({
        PLAYING: [{ id: 2, endsAt: null }],
        STARTING: [],
        COLLABORATIVE_CORRECTION: [],
      }),
    );

    await recoverActiveRounds();

    expect(handleTimeoutMock).toHaveBeenCalledWith(2);
  });

  it("rodada PLAYING com tempo restante é reagendada, e o callback delega para handleTimeout", async () => {
    findManyMock.mockImplementation(
      byStatus({
        PLAYING: [{ id: 3, endsAt: new Date(Date.now() + 10_000) }],
        STARTING: [],
        COLLABORATIVE_CORRECTION: [],
      }),
    );

    await recoverActiveRounds();

    expect(scheduleRoundEndMock).toHaveBeenCalledTimes(1);
    const [roundId, remaining, callback] = scheduleRoundEndMock.mock.calls[0];
    expect(roundId).toBe(3);
    expect(remaining).toBeGreaterThan(0);
    await callback();
    expect(handleTimeoutMock).toHaveBeenCalledWith(3);
  });

  it("rodada presa em STARTING avança direto para PLAYING via beginPlaying", async () => {
    findManyMock.mockImplementation(
      byStatus({
        PLAYING: [],
        STARTING: [{ id: 4 }],
        COLLABORATIVE_CORRECTION: [],
      }),
    );

    const count = await recoverActiveRounds();

    expect(beginPlayingMock).toHaveBeenCalledWith(4);
    expect(count).toBe(1);
  });

  it("falha ao retomar uma rodada em STARTING é registrada, sem interromper as demais", async () => {
    findManyMock.mockImplementation(
      byStatus({
        PLAYING: [],
        STARTING: [{ id: 5 }, { id: 6 }],
        COLLABORATIVE_CORRECTION: [],
      }),
    );
    beginPlayingMock.mockRejectedValueOnce(new Error("boom"));

    await expect(recoverActiveRounds()).resolves.toBe(2);
    expect(beginPlayingMock).toHaveBeenCalledWith(5);
    expect(beginPlayingMock).toHaveBeenCalledWith(6);
  });

  it("correção colaborativa já expirada é fechada imediatamente", async () => {
    findManyMock.mockImplementation(
      byStatus({
        PLAYING: [],
        STARTING: [],
        COLLABORATIVE_CORRECTION: [{ id: 7, collaborativeCorrectionEndsAt: new Date(Date.now() - 1000) }],
      }),
    );

    await recoverActiveRounds();

    expect(closeCollaborativeCorrectionMock).toHaveBeenCalledWith(7);
    expect(scheduleCollabTimeoutMock).not.toHaveBeenCalled();
  });

  it("correção colaborativa sem prazo (?? 0) também é tratada como expirada", async () => {
    findManyMock.mockImplementation(
      byStatus({
        PLAYING: [],
        STARTING: [],
        COLLABORATIVE_CORRECTION: [{ id: 8, collaborativeCorrectionEndsAt: null }],
      }),
    );

    await recoverActiveRounds();

    expect(closeCollaborativeCorrectionMock).toHaveBeenCalledWith(8);
  });

  it("correção colaborativa com prazo futuro é reagendada", async () => {
    findManyMock.mockImplementation(
      byStatus({
        PLAYING: [],
        STARTING: [],
        COLLABORATIVE_CORRECTION: [
          { id: 9, collaborativeCorrectionEndsAt: new Date(Date.now() + 15_000) },
        ],
      }),
    );

    const count = await recoverActiveRounds();

    expect(scheduleCollabTimeoutMock).toHaveBeenCalledTimes(1);
    const [roundId, remaining] = scheduleCollabTimeoutMock.mock.calls[0];
    expect(roundId).toBe(9);
    expect(remaining).toBeGreaterThan(0);
    expect(closeCollaborativeCorrectionMock).not.toHaveBeenCalled();
    expect(count).toBe(1);
  });

  it("soma rodadas de todas as categorias no total retornado", async () => {
    findManyMock.mockImplementation(
      byStatus({
        PLAYING: [{ id: 10, endsAt: new Date(Date.now() + 5000) }],
        STARTING: [{ id: 11 }],
        COLLABORATIVE_CORRECTION: [{ id: 12, collaborativeCorrectionEndsAt: new Date(Date.now() + 5000) }],
      }),
    );

    await expect(recoverActiveRounds()).resolves.toBe(3);
  });
});
