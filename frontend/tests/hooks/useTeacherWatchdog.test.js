import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTeacherWatchdog } from "../../src/pages/TeacherDashboardPage.hooks.jsx";
import {
  WATCHDOG_JITTER_MS,
  WATCHDOG_MAX_MS,
  WATCHDOG_STALE_MS,
} from "../../src/pages/StudentGamePage.hooks.jsx";

// Jitter aleatório embaralha o trigger do watchdog; a janela real de
// disparo fica entre STALE_MS e STALE_MS + JITTER_MS. Avançamos até o pior
// caso (base + jitter) mais folga para o primeiro tick disparar sempre.
const tickPastStale = () => vi.advanceTimersByTime(WATCHDOG_STALE_MS + WATCHDOG_JITTER_MS + 100);

describe("useTeacherWatchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function makeSocket() {
    return {
      connected: true,
      disconnect: vi.fn(),
      connect: vi.fn(),
    };
  }

  it("não agenda nada sem socket, sem estado ou desconectado", () => {
    const refresh = vi.fn();
    const { rerender } = renderHook(
      ({ props }) => useTeacherWatchdog(props),
      { initialProps: { props: {} } },
    );
    rerender({ props: { connected: true, state: { serverTime: "x" }, refresh, socket: null } });
    rerender({ props: { connected: false, state: { serverTime: "x" }, refresh, socket: makeSocket() } });
    vi.advanceTimersByTime(WATCHDOG_MAX_MS + 1_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("pede refresh quando nenhum estado autoritativo chega e segue em dia após resposta ok", async () => {
    const socket = makeSocket();
    const refresh = vi.fn().mockResolvedValue({ ok: true });
    // Estado inicial: connected + state => o watchdog vigia; nenhum push novo
    // (`state` não muda) => o gatilho de staleness dispara.
    renderHook(() => useTeacherWatchdog({ connected: true, state: { serverTime: "a" }, refresh, socket }));

    tickPastStale();
    await act(async () => {});
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.connect).not.toHaveBeenCalled();

    // Resposta ok reseta o backoff: próxima checagem volta na janela base.
    refresh.mockClear();
    await act(async () => {
      tickPastStale();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reconecta o socket quando o refresh falha (socket meia-aberta)", async () => {
    const socket = makeSocket();
    const refresh = vi.fn().mockResolvedValue({ ok: false, error: { code: "NOT_IN_ROOM" } });
    renderHook(() => useTeacherWatchdog({ connected: true, state: { serverTime: "a" }, refresh, socket }));

    await act(async () => {
      tickPastStale();
    });
    expect(refresh).toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it("não pede refresh quando um estado novo acabou de chegar", async () => {
    const socket = makeSocket();
    const refresh = vi.fn();
    const { rerender } = renderHook(
      ({ props }) => useTeacherWatchdog(props),
      { initialProps: { props: { connected: true, state: { serverTime: "a" }, refresh, socket } } },
    );
    // Um push novo chega dentro da janela => lastStateAt atualiza.
    rerender({ props: { connected: true, state: { serverTime: "b" }, refresh, socket } });
    vi.advanceTimersByTime(WATCHDOG_STALE_MS - 100);
    expect(refresh).not.toHaveBeenCalled();
  });
});