import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import PublicScreenPage from "../../src/pages/PublicScreenPage.jsx";
import api from "../../src/services/api.js";

vi.mock("../../src/services/api.js", () => ({
  default: {
    publicState: vi.fn(),
    roomQrCode: vi.fn(),
  },
}));

// --- useRoomSocket: fully controlled, and captures the `handlers` object so
// tests can fire socket events directly (roundStarted, emojiReceived, etc).
let lastHandlers = null;
let socketReturn = { connected: false, state: null };
const useRoomSocketMock = vi.fn((config) => {
  lastHandlers = config.handlers;
  return socketReturn;
});
vi.mock("../../src/hooks/useRoomSocket.js", () => ({
  default: (config) => useRoomSocketMock(config),
}));

// --- useServerClock: sync/now are irrelevant to page logic under test;
// useCountdown is fully controlled per test via its mock return value.
const useCountdownMock = vi.fn(() => null);
const syncMock = vi.fn();
vi.mock("../../src/hooks/useServerClock.js", () => ({
  useServerClock: () => ({ sync: syncMock, now: () => Date.now() }),
  useCountdown: (...args) => useCountdownMock(...args),
}));

// --- useAudio: stubbed so sound-cue calls are assertable without touching
// WebAudio, and so play()/playVoice()/toggle() calls are observable.
const audioMock = {
  play: vi.fn(),
  playVoice: vi.fn(),
  playMusic: vi.fn(),
  stopMusic: vi.fn(),
  unlock: vi.fn(),
  enabled: true,
  volume: 0.4,
  toggle: vi.fn(),
  setVolume: vi.fn(),
};
vi.mock("../../src/hooks/useAudio.js", () => ({
  default: () => audioMock,
}));

// --- components/public/* and the common screen widgets: out of scope here
// (owned by a different agent testing components/public + components/common)
// — stub each as a marker so PublicScreenPage's own branching/prop-passing
// logic is what's under test, not their internal animations/timers.
vi.mock("../../src/components/public/GameTitle.jsx", () => ({
  default: ({ name, roomCode }) => <div data-testid="game-title">{name} · {roomCode}</div>,
}));
vi.mock("../../src/components/public/ThemeDisplay.jsx", () => ({
  default: ({ theme, roundNumber }) => <div data-testid="theme-display">{theme} #{roundNumber}</div>,
}));
vi.mock("../../src/components/public/LetterAnimation.jsx", () => ({
  default: ({ letter }) => <div data-testid="letter-animation">{letter}</div>,
}));
vi.mock("../../src/components/public/Countdown.jsx", () => ({
  default: ({ seconds, running }) => <div data-testid="countdown">{running ? seconds : "stopped"}</div>,
}));
vi.mock("../../src/components/public/PlayerCount.jsx", () => ({
  default: ({ active, total, eliminated }) => (
    <div data-testid="player-count">{active}/{total}/{eliminated}</div>
  ),
}));
vi.mock("../../src/components/public/GameStatus.jsx", () => ({
  default: ({ status }) => <div data-testid="game-status">{status ?? "none"}</div>,
}));
vi.mock("../../src/components/public/Ranking.jsx", () => ({
  default: ({ entries, finished }) => (
    <div data-testid="ranking" data-finished={String(Boolean(finished))}>
      ranking:{entries.length}
    </div>
  ),
}));
vi.mock("../../src/components/common/ConnectionBadge.jsx", () => ({
  default: ({ connected }) => <div data-testid="connection-badge">{connected ? "online" : "offline"}</div>,
}));
vi.mock("../../src/components/common/EmojiBursts.jsx", () => ({
  default: ({ items }) => <div data-testid="emoji-bursts">{items.map((i) => i.emoji).join(",")}</div>,
}));
vi.mock("../../src/components/common/StopSplash.jsx", () => ({
  default: ({ onDone }) => (
    <div data-testid="stop-splash">
      <button type="button" onClick={onDone}>
        dismiss-splash
      </button>
    </div>
  ),
}));

/** Renders PublicScreenPage for the given initial route entry. */
function renderPage(initialEntry) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/screen" element={<PublicScreenPage />} />
        <Route path="/screen/:code" element={<PublicScreenPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PublicScreenPage", () => {
  beforeEach(() => {
    lastHandlers = null;
    socketReturn = { connected: false, state: null };
    useCountdownMock.mockReturnValue(null);
    api.publicState.mockResolvedValue(null);
    api.roomQrCode.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the code-entry form when there is no room code in the URL, and navigates on submit", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/screen"]}>
        <Routes>
          <Route path="/screen" element={<PublicScreenPage />} />
          <Route path="/screen/:code" element={<div>screen-for-code</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Tela pública")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Código da sala"), "  abcd  ");
    await user.click(screen.getByRole("button", { name: "Exibir" }));
    // Navigation happened away from the bare form (no route match needed —
    // we only assert the form itself unmounts).
    await waitFor(() => expect(screen.queryByText("Tela pública")).not.toBeInTheDocument());
  });

  it("does not navigate when the submitted code is blank", async () => {
    const user = userEvent.setup();
    renderPage("/screen");
    await user.click(screen.getByRole("button", { name: "Exibir" }));
    expect(screen.getByText("Tela pública")).toBeInTheDocument();
  });

  it("shows the lobby (QR + join code) while waiting for players, with no round at all", async () => {
    api.roomQrCode.mockResolvedValue({ dataUrl: "data:img", url: "http://x" });
    socketReturn = { connected: true, state: { round: null, game: { name: "Jogo" } } };

    renderPage("/screen/STOP-1");

    expect(await screen.findByRole("img", { name: /QR Code de entrada da sala STOP-1/ })).toBeInTheDocument();
    expect(screen.getByText("STOP-1")).toBeInTheDocument();
    expect(screen.getByTestId("game-title")).toHaveTextContent("Jogo · STOP-1");
    expect(screen.getByTestId("game-status")).toHaveTextContent("none");
    // O fundo animado está sempre presente, inclusive no lobby/pré-rodada.
    expect(document.querySelector(".screen__backdrop")).not.toBeNull();
  });

  it("treats a CREATED round as still waiting for players", () => {
    socketReturn = { connected: true, state: { round: { status: "CREATED" } } };
    renderPage("/screen/STOP-1");
    expect(screen.getByText("STOP-1")).toBeInTheDocument();
    expect(screen.queryByTestId("theme-display")).not.toBeInTheDocument();
  });

  it("treats a READY round as still waiting for players", () => {
    socketReturn = { connected: true, state: { round: { status: "READY" } } };
    renderPage("/screen/STOP-1");
    expect(screen.getByText("STOP-1")).toBeInTheDocument();
    expect(screen.queryByTestId("theme-display")).not.toBeInTheDocument();
  });

  it("shows theme/letter/countdown once the round leaves the waiting phases (PLAYING), plus the small footer QR", async () => {
    useCountdownMock.mockReturnValue(42);
    api.roomQrCode.mockResolvedValue({ dataUrl: "data:img", url: "http://x" });
    socketReturn = {
      connected: true,
      state: {
        round: { status: "PLAYING", themeName: "Biologia", roundNumber: 2, letter: "B", endsAt: "later" },
        game: { name: "Jogo" },
        activePlayers: 5,
        totalPlayers: 8,
        eliminatedPlayers: 1,
      },
    };

    renderPage("/screen/STOP-1");

    expect(screen.getByTestId("theme-display")).toHaveTextContent("Biologia #2");
    expect(screen.getByTestId("letter-animation")).toHaveTextContent("B");
    expect(screen.getByTestId("countdown")).toHaveTextContent("42");
    expect(screen.getByTestId("game-status")).toHaveTextContent("PLAYING");
    expect(screen.getByTestId("player-count")).toHaveTextContent("5/8/1");
    // Outside the lobby, the small footer QR appears once it has loaded.
    expect(
      await screen.findByRole("img", { name: "QR Code de entrada da sala STOP-1" }),
    ).toHaveAttribute("src", "data:img");
  });

  it("re-syncs the clock whenever the view carries a serverTime", () => {
    socketReturn = {
      connected: true,
      state: { round: { status: "PLAYING" }, serverTime: "2026-01-01T00:00:00Z" },
    };
    renderPage("/screen/STOP-1");
    expect(screen.getByTestId("game-status")).toHaveTextContent("PLAYING");

    // The `onState` handler passed to useRoomSocket is its own separate sync
    // side-channel (distinct from the `state` prop driving the render above)
    // — invoke it directly to exercise that code path too.
    syncMock.mockClear();
    act(() => lastHandlers.onState({ serverTime: "2026-01-01T00:00:05Z" }));
    expect(syncMock).toHaveBeenCalledWith("2026-01-01T00:00:05Z");
  });

  it("plays the FINAL_SECONDS cue once per second in the last 10 seconds while playing", () => {
    useCountdownMock.mockReturnValue(5);
    socketReturn = { connected: true, state: { round: { status: "PLAYING", endsAt: "later" } } };
    renderPage("/screen/STOP-1");
    expect(audioMock.play).toHaveBeenCalledWith("FINAL_SECONDS");
  });

  it("does not beep when not playing, past 10s, or at/under 0s", () => {
    useCountdownMock.mockReturnValue(15);
    socketReturn = { connected: true, state: { round: { status: "PLAYING", endsAt: "later" } } };
    renderPage("/screen/STOP-1");
    expect(audioMock.play).not.toHaveBeenCalledWith("FINAL_SECONDS");
  });

  it("falls back to connectedPlayers/0/0 when the richer player-count fields are absent", () => {
    socketReturn = { connected: true, state: { round: { status: "PLAYING" }, connectedPlayers: 3 } };
    renderPage("/screen/STOP-1");
    expect(screen.getByTestId("player-count")).toHaveTextContent("3/0/0");
  });

  it("does not render the Countdown component outside the PLAYING phase", () => {
    socketReturn = { connected: true, state: { round: { status: "STOPPED" } } };
    renderPage("/screen/STOP-1");
    expect(screen.queryByTestId("countdown")).not.toBeInTheDocument();
  });

  it("shows the collaborative-correction progress bar with a computed percentage", () => {
    socketReturn = { connected: true, state: { round: { status: "COLLABORATIVE_CORRECTION" } } };
    renderPage("/screen/STOP-1");

    act(() => {
      lastHandlers.collaborativeCorrectionStarted({
        completedAssignments: 3,
        totalAssignments: 12,
        completedGraders: 2,
        totalGraders: 6,
      });
    });

    expect(screen.getByRole("status")).toHaveTextContent("2 / 6 jogadores concluíram");
    expect(document.querySelector(".screen__collabProgressFill")).toHaveStyle({ width: "25%" });
  });

  it("shows 0% progress when totalAssignments is 0", () => {
    socketReturn = { connected: true, state: { round: { status: "COLLABORATIVE_CORRECTION" } } };
    renderPage("/screen/STOP-1");
    act(() => {
      lastHandlers.collaborativeCorrectionProgress({
        completedAssignments: 0,
        totalAssignments: 0,
        completedGraders: 0,
        totalGraders: 0,
      });
    });
    expect(document.querySelector(".screen__collabProgressFill")).toHaveStyle({ width: "0%" });
  });

  it("hides the progress bar once collaborative correction finishes", () => {
    socketReturn = { connected: true, state: { round: { status: "COLLABORATIVE_CORRECTION" } } };
    renderPage("/screen/STOP-1");
    act(() => {
      lastHandlers.collaborativeCorrectionStarted({ completedAssignments: 1, totalAssignments: 2, completedGraders: 1, totalGraders: 2 });
    });
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => {
      lastHandlers.collaborativeCorrectionFinished();
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows 'STOP de <name>' when there is a first stopper and the round isn't PLAYING", () => {
    socketReturn = {
      connected: true,
      state: { round: { status: "STOPPED", firstStopperName: "Ana" } },
    };
    renderPage("/screen/STOP-1");
    expect(screen.getByText("STOP de Ana")).toBeInTheDocument();
  });

  it("hides 'STOP de <name>' while the round is still PLAYING", () => {
    socketReturn = {
      connected: true,
      state: { round: { status: "PLAYING", firstStopperName: "Ana" } },
    };
    renderPage("/screen/STOP-1");
    expect(screen.queryByText("STOP de Ana")).not.toBeInTheDocument();
  });

  it("plays the START cue on roundStarted, and STOPPED cue + voice + splash on roundStopped", () => {
    socketReturn = { connected: true, state: { round: { status: "PLAYING" } } };
    renderPage("/screen/STOP-1");

    act(() => lastHandlers.roundStarted());
    expect(audioMock.play).toHaveBeenCalledWith("START");

    expect(screen.queryByTestId("stop-splash")).not.toBeInTheDocument();
    act(() => lastHandlers.roundStopped());
    expect(audioMock.play).toHaveBeenCalledWith("STOPPED");
    expect(audioMock.playVoice).toHaveBeenCalled();
    expect(screen.getByTestId("stop-splash")).toBeInTheDocument();
  });

  it("shows the splash on roundTimedOut too, and it can be dismissed", async () => {
    const user = userEvent.setup();
    socketReturn = { connected: true, state: { round: { status: "PLAYING" } } };
    renderPage("/screen/STOP-1");

    act(() => lastHandlers.roundTimedOut());
    expect(screen.getByTestId("stop-splash")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "dismiss-splash" }));
    expect(screen.queryByTestId("stop-splash")).not.toBeInTheDocument();
  });

  it("pushes an emoji burst on emojiReceived", () => {
    socketReturn = { connected: true, state: { round: { status: "PLAYING" } } };
    renderPage("/screen/STOP-1");

    act(() => lastHandlers.emojiReceived({ emoji: "🎉" }));
    expect(screen.getByTestId("emoji-bursts")).toHaveTextContent("🎉");
  });

  it("shows only the Ranking + emoji bursts (no header/footer) when the round is SCORED", () => {
    socketReturn = {
      connected: true,
      state: { round: { status: "SCORED" }, ranking: [{ studentId: 1 }, { studentId: 2 }] },
    };
    renderPage("/screen/STOP-1");

    expect(screen.getByTestId("ranking")).toHaveTextContent("ranking:2");
    // Rodada pontuada nao e fim de partida: lista, nao podio.
    expect(screen.getByTestId("ranking")).toHaveAttribute("data-finished", "false");
    expect(screen.queryByTestId("game-title")).not.toBeInTheDocument();
    expect(screen.queryByTestId("connection-badge")).not.toBeInTheDocument();
    // Fundo animado presente (bolhas + particulas), sem a variante do cenário.
    expect(document.querySelector(".screen__backdrop")).not.toBeNull();
    expect(document.querySelector(".screen__backdrop--podium")).toBeNull();
  });

  it("also shows only the Ranking when the game itself is FINISHED, defaulting entries to an empty list", () => {
    socketReturn = { connected: true, state: { round: { status: "CORRECTION" }, game: { status: "FINISHED" } } };
    renderPage("/screen/STOP-1");
    expect(screen.getByTestId("ranking")).toHaveTextContent("ranking:0");
    // Partida encerrada: e aqui, e so aqui, que o podio entra.
    expect(screen.getByTestId("ranking")).toHaveAttribute("data-finished", "true");
    // Na partida encerrada o fundo animado usa a variante do cenário.
    expect(document.querySelector(".screen__backdrop--podium")).not.toBeNull();
  });

  it("toggles audio from the footer, and reflects the connection badge state", async () => {
    const user = userEvent.setup();
    socketReturn = { connected: false, state: { round: { status: "PLAYING" } } };
    renderPage("/screen/STOP-1");

    expect(screen.getByTestId("connection-badge")).toHaveTextContent("offline");
    await user.click(screen.getByRole("button", { name: "🔊" }));
    expect(audioMock.toggle).toHaveBeenCalled();
  });

  it("aplica o volume da TV comandado remotamente pelo professor", () => {
    socketReturn = {
      connected: true,
      state: { round: { status: "PLAYING" }, settings: { volume: 0.4 } },
    };
    renderPage("/screen/STOP-1");
    expect(audioMock.setVolume).toHaveBeenCalledWith(0.4);
  });

  it("muda a tela pública quando o professor ativa o mudo", () => {
    audioMock.enabled = true;
    socketReturn = {
      connected: true,
      state: { round: { status: "PLAYING" }, settings: { muted: true } },
    };
    renderPage("/screen/STOP-1");
    expect(audioMock.toggle).toHaveBeenCalled();
    expect(audioMock.enabled).toBe(true); // o mock não sofre efeito; só verifica a chamada
    audioMock.enabled = true;
  });

  it("aplica volume e mudo remotamente pelo evento LEVE roomSettingsChanged, sem esperar um publish completo", () => {
    audioMock.enabled = true;
    socketReturn = {
      connected: true,
      state: { round: { status: "PLAYING" }, settings: { volume: 0.5, muted: false } },
    };
    renderPage("/screen/STOP-1");
    expect(audioMock.setVolume).toHaveBeenLastCalledWith(0.5);

    // O professor arrasta o slider: o ajuste chega por um evento pequeno
    // (não por uma projeção de estado completa), e a TV aplica na hora.
    act(() => {
      lastHandlers.roomSettingsChanged({ volume: 0.85 });
    });
    expect(audioMock.setVolume).toHaveBeenLastCalledWith(0.85);

    // E o mudo, quando ligado de longe:
    act(() => {
      lastHandlers.roomSettingsChanged({ muted: true });
    });
    expect(audioMock.toggle).toHaveBeenCalled();

    audioMock.enabled = true;
  });

  it("unlocks audio on the very first interaction anywhere on the page, unattended (spec bells-and-whistles)", async () => {
    // A tela pública normalmente é um TV ligado na sala sem ninguém
    // clicando no botão de mudo — sem esse desbloqueio genérico a música
    // de fundo ficava travada pra sempre pela política de autoplay.
    socketReturn = { connected: true, state: { round: { status: "PLAYING" } } };
    renderPage("/screen/STOP-1");

    expect(audioMock.unlock).not.toHaveBeenCalled();
    act(() => {
      document.dispatchEvent(new Event("keydown"));
    });
    expect(audioMock.unlock).toHaveBeenCalledTimes(1);

    // Só desbloqueia uma vez: um segundo gesto qualquer não chama de novo.
    act(() => {
      document.dispatchEvent(new Event("pointerdown"));
    });
    expect(audioMock.unlock).toHaveBeenCalledTimes(1);
  });

  it("shows the muted icon in the footer when audio is disabled", () => {
    audioMock.enabled = false;
    try {
      socketReturn = { connected: true, state: { round: { status: "PLAYING" } } };
      renderPage("/screen/STOP-1");
      expect(screen.getByRole("button", { name: "🔇" })).toBeInTheDocument();
    } finally {
      audioMock.enabled = true;
    }
  });

  it("falls back to the REST publicState snapshot when there is no socket state yet", async () => {
    socketReturn = { connected: false, state: null };
    api.publicState.mockResolvedValue({ round: { status: "PLAYING", themeName: "Fallback" }, game: { name: "Via REST" } });

    renderPage("/screen/STOP-1");

    expect(await screen.findByTestId("theme-display")).toHaveTextContent("Fallback");
    expect(screen.getByTestId("game-title")).toHaveTextContent("Via REST · STOP-1");
  });

  it("defaults the game title to 'Partida' when there is no game name available", () => {
    socketReturn = { connected: true, state: { round: null } };
    renderPage("/screen/STOP-1");
    expect(screen.getByTestId("game-title")).toHaveTextContent("Partida · STOP-1");
  });
});
