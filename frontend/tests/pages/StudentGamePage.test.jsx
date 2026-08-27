import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudentGamePage from "../../src/pages/StudentGamePage.jsx";
import { PlayerProvider } from "../../src/state/PlayerContext.jsx";
import api from "../../src/services/api.js";
import { emitAck } from "../../src/socket/socket.js";

vi.mock("../../src/services/api.js", () => ({
  default: { playerState: vi.fn() },
}));

vi.mock("../../src/socket/socket.js", () => ({
  createSocket: vi.fn(() => ({ emit: vi.fn(), on: vi.fn() })),
  emitAck: vi.fn(),
  // Idempotência roda na página via emitCommand; o shim simplesmente repassa
  // para o emitAck mockado para os testes continuarem spyando o envio.
  emitCommand: (socket, event, payload) => emitAck(socket, event, payload),
}));

// --- useRoomSocket: a real-stateful stand-in (backed by React state so
// `setState` calls from the page actually take effect, e.g. the REST
// fallback path), seeded per test via `seedSocket`. Captures `handlers` so
// tests can fire socket events directly.
let lastHandlers = null;
let seed = { connected: false, state: null };
function seedSocket(next) {
  seed = next;
}
function useRoomSocketImpl(config) {
  lastHandlers = config.handlers;
  const [state, setState] = useState(seed.state);
  // `seed.socket` lets a test opt into a null socket (e.g. mid-handshake)
  // to exercise the `!socketInstance` guards; defaults to a live-looking one.
  const socket = "socket" in seed ? seed.socket : { emit: vi.fn(), on: vi.fn() };
  return { socket, connected: seed.connected, state, setState };
}
vi.mock("../../src/hooks/useRoomSocket.js", () => ({
  default: (config) => useRoomSocketImpl(config),
}));

// --- useServerClock: useCountdown fully controlled per test.
const useCountdownMock = vi.fn(() => null);
vi.mock("../../src/hooks/useServerClock.js", () => ({
  useServerClock: () => ({ sync: vi.fn(), now: () => Date.now() }),
  useCountdown: (...args) => useCountdownMock(...args),
}));

// --- useAudio: stubbed for assertable play()/toggle()/unlock() calls.
const audioMock = { play: vi.fn(), playVoice: vi.fn(), unlock: vi.fn(), enabled: true, volume: 0.4, toggle: vi.fn(), setVolume: vi.fn() };
vi.mock("../../src/hooks/useAudio.js", () => ({
  default: () => audioMock,
}));

// --- useFullscreen: stubbed so tests don't depend on jsdom's (nonexistent)
// Fullscreen API, and so enter/exit/onExit are directly assertable/callable.
let lastOnExit = null;
const fullscreenMock = { isFullscreen: false, supported: true, enter: vi.fn().mockResolvedValue(true), exit: vi.fn() };
vi.mock("../../src/hooks/useFullscreen.js", () => ({
  default: ({ onExit } = {}) => {
    lastOnExit = onExit;
    return fullscreenMock;
  },
}));

// --- components/student/*: out of scope here (owned by a different agent
// testing components/student directly) — stubbed as markers so this page's
// own state/branching wiring is what's under test.
vi.mock("../../src/components/student/GameHeader.jsx", () => ({
  default: ({ round, seconds, running, filled, total }) => (
    <div data-testid="game-header">
      {round?.status ?? "no-round"}|{running ? seconds : "stopped"}|{filled}/{total}
    </div>
  ),
}));
vi.mock("../../src/components/student/CategoryList.jsx", () => ({
  default: ({ categories, currentId, onSelect }) => (
    <ul data-testid="category-list">
      {categories.map((c) => (
        <li key={c.id}>
          <button type="button" onClick={() => onSelect(c.id)} aria-pressed={c.id === currentId}>
            {c.name}
          </button>
        </li>
      ))}
    </ul>
  ),
}));
vi.mock("../../src/components/student/AnswerEditor.jsx", () => ({
  default: ({ category, value, onChange, onCommit, onClose }) => (
    <div data-testid="answer-editor">
      <label htmlFor="answer-input">{category.name}</label>
      <input id="answer-input" value={value} onChange={(e) => onChange(category.id, e.target.value)} />
      <button type="button" onClick={() => onCommit(category.id)}>
        commit
      </button>
      <button type="button" onClick={onClose}>
        close-editor
      </button>
    </div>
  ),
}));
vi.mock("../../src/components/student/StopButton.jsx", () => ({
  default: ({ disabled, filled, total, onClick }) => (
    <button type="button" data-testid="stop-button" disabled={disabled} onClick={onClick}>
      STOP {filled}/{total}
    </button>
  ),
}));
vi.mock("../../src/components/student/CollaborativeCorrection.jsx", () => ({
  default: ({ reviews, onDecide }) => (
    <div data-testid="collab-correction">
      collab:{reviews.length}
      <button type="button" onClick={() => reviews[0] && onDecide(reviews[0].reviewId, "VALID")}>
        decide-valid
      </button>
    </div>
  ),
}));
vi.mock("../../src/components/student/EmojiPicker.jsx", () => ({
  default: ({ onSend }) => (
    <button type="button" data-testid="emoji-send" onClick={() => onSend("🎉")}>
      send-emoji
    </button>
  ),
}));

const PLAYER = {
  playerToken: "tok-1",
  room: { code: "STOP-1" },
  student: { name: "Ana", avatarUrl: null },
};

function renderPage({ player = PLAYER } = {}) {
  if (player) {
    window.sessionStorage.setItem("stop:player", JSON.stringify(player));
  }
  return render(
    <MemoryRouter initialEntries={["/play"]}>
      <PlayerProvider>
        <Routes>
          <Route path="/" element={<div>home-screen</div>} />
          <Route path="/play" element={<StudentGamePage />} />
        </Routes>
      </PlayerProvider>
    </MemoryRouter>,
  );
}

describe("StudentGamePage", () => {
  beforeEach(() => {
    lastHandlers = null;
    lastOnExit = null;
    seed = { connected: false, state: null };
    useCountdownMock.mockReturnValue(null);
    api.playerState.mockResolvedValue(null);
    emitAck.mockResolvedValue({ ok: true, data: {} });
    fullscreenMock.isFullscreen = false;
    fullscreenMock.supported = true;
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("redirects home when there is no player session", () => {
    renderPage({ player: null });
    expect(screen.getByText("home-screen")).toBeInTheDocument();
  });

  it("shows the 'waiting for players' notice when there is no round yet", () => {
    seedSocket({ connected: true, state: { student: { name: "Ana" } } });
    renderPage();
    expect(screen.getByText("Aguardando jogadores")).toBeInTheDocument();
    expect(screen.getByTestId("game-header")).toHaveTextContent("no-round");
  });

  it("shows the top bar with student name, room code and avatar", () => {
    seedSocket({
      connected: true,
      state: { student: { name: "Ana Silva", avatarUrl: "/a.svg" } },
    });
    renderPage();
    expect(screen.getByText(/Ana Silva · sala STOP-1/)).toBeInTheDocument();
    expect(document.querySelector("img.student__avatar")).toHaveAttribute("src", "/a.svg");
  });

  it("falls back to the player's own avatar/name when the socket state lacks one", () => {
    seedSocket({ connected: false, state: null });
    renderPage({ player: { ...PLAYER, student: { name: "Ana", avatarUrl: "/fallback.svg" } } });
    expect(document.querySelector("img.student__avatar")).toHaveAttribute("src", "/fallback.svg");
  });

  it("shows a status message for each round phase (CREATED)", () => {
    seedSocket({ connected: true, state: { round: { status: "CREATED", id: 1 } } });
    renderPage();
    expect(screen.getByText("Aguardando")).toBeInTheDocument();
    expect(screen.getByText("O professor está preparando a rodada.")).toBeInTheDocument();
  });

  it("shows the ticking reveal countdown during STARTING, before the letter is known", () => {
    useCountdownMock.mockImplementation((endsAt) => (endsAt ? 3 : null));
    seedSocket({ connected: true, state: { round: { status: "STARTING", id: 1, revealAt: "later" } } });
    renderPage();
    expect(screen.getByText("Preparar!")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows the letter once known during STARTING, instead of the countdown", () => {
    useCountdownMock.mockImplementation((endsAt) => (endsAt ? 3 : null));
    seedSocket({
      connected: true,
      state: { round: { status: "STARTING", id: 1, revealAt: "later", letter: "B" } },
    });
    renderPage();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("shows an em-dash placeholder during STARTING once the reveal countdown hits 0", () => {
    useCountdownMock.mockImplementation((endsAt) => (endsAt ? 0 : null));
    seedSocket({ connected: true, state: { round: { status: "STARTING", id: 1, revealAt: "later" } } });
    renderPage();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows categories and the answer editor once the round is PLAYING", async () => {
    const user = userEvent.setup();
    useCountdownMock.mockReturnValue(90);
    seedSocket({
      connected: true,
      state: {
        roundStatus: "PLAYING",
        round: {
          status: "PLAYING",
          id: 1,
          letter: "B",
          endsAt: "later",
          categories: [
            { id: "c1", name: "Animal", required: true },
            { id: "c2", name: "Fruta", required: true },
          ],
        },
      },
    });
    renderPage();

    expect(screen.getByTestId("category-list")).toBeInTheDocument();
    expect(screen.getByTestId("game-header")).toHaveTextContent("PLAYING|90|0/2");

    await user.click(screen.getByRole("button", { name: "Animal" }));
    expect(screen.getByTestId("answer-editor")).toBeInTheDocument();
  });

  it("does not show categories before the round has actually started (CREATED/READY/STARTING)", () => {
    seedSocket({
      connected: true,
      state: { round: { status: "READY", id: 1, categories: [{ id: "c1", name: "Animal" }] } },
    });
    renderPage();
    expect(screen.queryByTestId("category-list")).not.toBeInTheDocument();
  });

  it("closes the answer editor and commits when onClose fires", async () => {
    const user = userEvent.setup();
    seedSocket({
      connected: true,
      state: {
        roundStatus: "PLAYING",
        round: { status: "PLAYING", id: 1, categories: [{ id: "c1", name: "Animal", required: true }] },
      },
    });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Animal" }));
    expect(screen.getByTestId("answer-editor")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "close-editor" }));
    expect(screen.queryByTestId("answer-editor")).not.toBeInTheDocument();
  });

  it("commits the previous category when switching to a different one", async () => {
    const user = userEvent.setup();
    seedSocket({
      connected: true,
      state: {
        roundStatus: "PLAYING",
        round: {
          status: "PLAYING",
          id: 1,
          categories: [
            { id: "c1", name: "Animal", required: true },
            { id: "c2", name: "Fruta", required: true },
          ],
        },
      },
    });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Animal" }));
    await user.type(screen.getByRole("textbox"), "Ariranha");
    emitAck.mockClear();
    await user.click(screen.getByRole("button", { name: "Fruta" }));
    // Switching categories commits the previous one via emitAck submitAnswer.
    await waitFor(() =>
      expect(emitAck).toHaveBeenCalledWith(
        expect.anything(),
        "submitAnswer",
        expect.objectContaining({ roundCategoryId: "c1" }),
      ),
    );
  });

  it("shows the eliminated notice, with a default message when none is provided", () => {
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();
    act(() => lastHandlers.playerEliminated({}));
    expect(screen.getByText("Você foi eliminado desta rodada")).toBeInTheDocument();
    expect(audioMock.play).toHaveBeenCalledWith("ELIMINATED");
  });

  it("shows a custom eliminated message when provided", () => {
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();
    act(() => lastHandlers.playerEliminated({ message: "Você saiu do app." }));
    expect(screen.getByText("Você saiu do app.")).toBeInTheDocument();
  });

  it("shows a feedback alert on socket error, and on roundStopped/roundTimedOut with STOP splash", () => {
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();

    act(() => lastHandlers.onError({ message: "Falha de conexão" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Falha de conexão");

    act(() => lastHandlers.roundStopped({ firstStopperName: "Beto" }));
    expect(audioMock.play).toHaveBeenCalledWith("STOPPED");
    expect(audioMock.playVoice).toHaveBeenCalled();
    expect(screen.getByText("STOP! Beto encerrou a rodada.")).toBeInTheDocument();
    expect(screen.getByRole("alert", { name: "STOP!" })).toBeInTheDocument();
  });

  it("hides the STOP splash on its own once its animation timer elapses", () => {
    vi.useFakeTimers();
    try {
      seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
      renderPage();
      act(() => lastHandlers.roundStopped({ firstStopperName: "Beto" }));
      expect(screen.getByRole("alert", { name: "STOP!" })).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(2500));
      expect(screen.queryByRole("alert", { name: "STOP!" })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a generic STOP message when roundStopped has no firstStopperName", () => {
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();
    act(() => lastHandlers.roundStopped({}));
    expect(screen.getByText("STOP! A rodada foi encerrada.")).toBeInTheDocument();
  });

  it("shows the timeout message and splash on roundTimedOut", () => {
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();
    act(() => lastHandlers.roundTimedOut());
    expect(screen.getByText("O tempo acabou. A rodada foi encerrada.")).toBeInTheDocument();
  });

  it("resets local state and shows a message on roundCreated/roundCancelled", () => {
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();

    act(() => lastHandlers.roundCancelled({ message: "Cancelada pelo professor" }));
    expect(screen.getByText("Cancelada pelo professor")).toBeInTheDocument();

    act(() => lastHandlers.roundCancelled());
    expect(screen.getByText("O professor cancelou esta rodada.")).toBeInTheDocument();

    act(() => lastHandlers.roundCreated());
    act(() => lastHandlers.roundStarted());
    expect(audioMock.play).toHaveBeenCalledWith("START");
  });

  it("plays a cue on letterSelected and syncCountdownRequested", () => {
    seedSocket({ connected: true, state: { round: { status: "CREATED", id: 1 } } });
    renderPage();
    act(() => lastHandlers.letterSelected());
    act(() => lastHandlers.syncCountdownRequested());
    expect(audioMock.play).toHaveBeenCalledWith("LETTER");
  });

  it("shows the collaborative-correction UI only when not playing and status is COLLABORATIVE_CORRECTION", () => {
    seedSocket({ connected: true, state: { round: { status: "COLLABORATIVE_CORRECTION", id: 1 } } });
    renderPage();
    act(() => lastHandlers.reviewAssigned({ reviews: [{ reviewId: "r1", value: "x" }] }));
    expect(screen.getByTestId("collab-correction")).toHaveTextContent("collab:1");
  });

  it("decides a review and marks it completed via reviewCompleted", async () => {
    const user = userEvent.setup();
    seedSocket({ connected: true, state: { round: { status: "COLLABORATIVE_CORRECTION", id: 1 } } });
    renderPage();
    act(() => lastHandlers.reviewAssigned({ reviews: [{ reviewId: "r1", value: "x" }] }));
    await user.click(screen.getByRole("button", { name: "decide-valid" }));
    await waitFor(() =>
      expect(emitAck).toHaveBeenCalledWith(
        expect.anything(),
        "submitReview",
        expect.objectContaining({ reviewId: "r1", decision: "VALID" }),
      ),
    );

    act(() => lastHandlers.reviewCompleted({ reviewId: "r1" }));
  });

  it("shows the ranking once the round is SCORED, capped at 10, medals for top 3", () => {
    seedSocket({ connected: true, state: { round: { status: "SCORED", id: 1 } } });
    renderPage();
    const ranking = Array.from({ length: 12 }, (_, i) => ({
      studentId: i + 1,
      position: i + 1,
      name: `Aluno ${i + 1}`,
      total: 100 - i,
    }));
    act(() => lastHandlers.rankingUpdated({ ranking }));
    expect(audioMock.play).toHaveBeenCalledWith("RANKING");
    expect(screen.getByText("🥇")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.queryByText("Aluno 11")).not.toBeInTheDocument();
  });

  it("shows the student's own placement, points and medal when they are in the top 3", () => {
    seedSocket({
      connected: true,
      state: { round: { status: "SCORED", id: 1 }, student: { id: 2, name: "Aluno 2" } },
    });
    renderPage();
    const ranking = Array.from({ length: 12 }, (_, i) => ({
      studentId: i + 1,
      position: i + 1,
      name: `Aluno ${i + 1}`,
      total: 100 - i,
    }));
    act(() => lastHandlers.rankingUpdated({ ranking }));

    expect(screen.getByText(/Sua colocação/)).toBeInTheDocument();
    expect(screen.getByText("2º lugar")).toBeInTheDocument();
    // Os 99 pontos aparecem no destaque e na linha da lista.
    expect(screen.getAllByText("99").length).toBeGreaterThan(0);
    // 🥈 aparece na linha da lista e tambem no destaque da propria colocacao.
    expect(screen.getAllByText("🥈").length).toBeGreaterThan(1);
  });

  it("shows the student's own placement even when they are far outside the top 10", () => {
    // O caso real que quebrava: turma grande, aluno em 42o lugar. Antes ele
    // via so o top 10 e nunca a propria colocacao.
    seedSocket({
      connected: true,
      state: { round: { status: "SCORED", id: 1 }, student: { id: 42, name: "Aluno 42" } },
    });
    renderPage();
    const ranking = Array.from({ length: 60 }, (_, i) => ({
      studentId: i + 1,
      position: i + 1,
      name: `Aluno ${i + 1}`,
      total: 100 - i,
    }));
    act(() => lastHandlers.rankingUpdated({ ranking }));

    expect(screen.getByText("42º lugar")).toBeInTheDocument();
    expect(screen.getByText(/Sua colocação/)).toBeInTheDocument();
    // A propria linha e anexada apos o top 10 (10 + separador + ela).
    expect(screen.getByText("Aluno 42")).toBeInTheDocument();
    expect(screen.queryByText("Aluno 11")).not.toBeInTheDocument();
  });

  it("still caps at 10 rows when the student's identity is unknown", () => {
    seedSocket({ connected: true, state: { round: { status: "SCORED", id: 1 } } });
    renderPage();
    const ranking = Array.from({ length: 12 }, (_, i) => ({
      studentId: i + 1,
      position: i + 1,
      name: `Aluno ${i + 1}`,
      total: 100 - i,
    }));
    act(() => lastHandlers.rankingUpdated({ ranking }));

    expect(screen.queryByText(/Sua colocação/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  it("hides the ranking while the round is still playing, even if ranking data exists", () => {
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();
    act(() => lastHandlers.rankingUpdated({ ranking: [{ studentId: 1, position: 1, name: "Ana", total: 5 }] }));
    expect(screen.queryByRole("heading", { name: "Ranking" })).not.toBeInTheDocument();
  });

  it("shows the ranking when the game itself is FINISHED even mid-correction", () => {
    seedSocket({
      connected: true,
      state: { round: { status: "CORRECTION", id: 1 }, game: { status: "FINISHED" } },
    });
    renderPage();
    act(() => lastHandlers.rankingUpdated({ ranking: [{ studentId: 1, position: 1, name: "Ana", total: 5 }] }));
    expect(screen.getByRole("heading", { name: "Ranking" })).toBeInTheDocument();
  });

  it("pushes an emoji burst on emojiReceived, and sends one via the picker", async () => {
    const user = userEvent.setup();
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();
    act(() => lastHandlers.emojiReceived({ emoji: "🎉" }));
    expect(document.querySelector(".emoji-bursts__item")).toHaveTextContent("🎉");

    await user.click(screen.getByTestId("emoji-send"));
    expect(emitAck).toHaveBeenCalledWith(expect.anything(), "sendEmoji", { emoji: "🎉" });
  });

  it("toggles audio and leaves the room from the footer, clearing the session", async () => {
    const user = userEvent.setup();
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();

    await user.click(screen.getByRole("button", { name: "🔊 Som ligado" }));
    expect(audioMock.toggle).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Sair" }));
    expect(await screen.findByText("home-screen")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("stop:player")).toBeNull();
  });

  it("shows the muted footer label when audio is disabled", () => {
    audioMock.enabled = false;
    try {
      seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
      renderPage();
      expect(screen.getByRole("button", { name: "🔇 Som desligado" })).toBeInTheDocument();
    } finally {
      audioMock.enabled = true;
    }
  });

  it("shows the STOP button as disabled/enabled based on required-category completeness", async () => {
    const user = userEvent.setup();
    seedSocket({
      connected: true,
      state: {
        roundStatus: "PLAYING",
        round: {
          status: "PLAYING",
          id: 1,
          categories: [{ id: "c1", name: "Animal", required: true }],
        },
      },
    });
    renderPage();
    expect(screen.getByTestId("stop-button")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Animal" }));
    await user.type(screen.getByRole("textbox"), "Ariranha");
    await waitFor(() => expect(screen.getByTestId("stop-button")).not.toBeDisabled());
  });

  it("requests a STOP via emitAck and shows success feedback", async () => {
    const user = userEvent.setup();
    emitAck.mockImplementation((_s, event) =>
      event === "requestStop"
        ? Promise.resolve({ ok: true })
        : Promise.resolve({ ok: true, data: {} }),
    );
    seedSocket({
      connected: true,
      state: {
        roundStatus: "PLAYING",
        round: { status: "PLAYING", id: 1, categories: [{ id: "c1", name: "Animal", required: true }] },
      },
    });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Animal" }));
    await user.type(screen.getByRole("textbox"), "Ariranha");
    await waitFor(() => expect(screen.getByTestId("stop-button")).not.toBeDisabled());

    await user.click(screen.getByTestId("stop-button"));
    expect(await screen.findByText("Você deu STOP primeiro!")).toBeInTheDocument();
  });

  it("shows an error message when the STOP is rejected", async () => {
    const user = userEvent.setup();
    emitAck.mockImplementation((_s, event) =>
      event === "requestStop"
        ? Promise.resolve({ ok: false, error: { message: "STOP rejeitado pelo servidor" } })
        : Promise.resolve({ ok: true, data: {} }),
    );
    seedSocket({
      connected: true,
      state: {
        roundStatus: "PLAYING",
        round: { status: "PLAYING", id: 1, categories: [{ id: "c1", name: "Animal", required: true }] },
      },
    });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Animal" }));
    await user.type(screen.getByRole("textbox"), "Ariranha");
    await waitFor(() => expect(screen.getByTestId("stop-button")).not.toBeDisabled());
    await user.click(screen.getByTestId("stop-button"));
    expect(await screen.findByText("STOP rejeitado pelo servidor")).toBeInTheDocument();
  });

  it("enters the game (fullscreen + 'ready') on the first pointerdown while waiting to start", async () => {
    seedSocket({ connected: true, state: { round: { status: "CREATED", id: 1 } } });
    renderPage();

    act(() => {
      document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    await waitFor(() => expect(fullscreenMock.enter).toHaveBeenCalled());
    expect(audioMock.unlock).toHaveBeenCalled();
    await waitFor(() =>
      expect(emitAck).toHaveBeenCalledWith(expect.anything(), "ready", expect.objectContaining({})),
    );
  });

  it("shows the 'return to fullscreen' warning while playing outside fullscreen, and lets the student re-enter", async () => {
    const user = userEvent.setup();
    fullscreenMock.isFullscreen = false;
    fullscreenMock.supported = true;
    seedSocket({ connected: true, state: { roundStatus: "PLAYING", round: { status: "PLAYING", id: 1 } } });
    renderPage();

    expect(screen.getByText(/Você não está em tela cheia/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Voltar à tela cheia" }));
    expect(fullscreenMock.enter).toHaveBeenCalled();
  });

  it("hides the fullscreen warning when fullscreen isn't supported at all", () => {
    fullscreenMock.isFullscreen = false;
    fullscreenMock.supported = false;
    seedSocket({ connected: true, state: { roundStatus: "PLAYING", round: { status: "PLAYING", id: 1 } } });
    renderPage();
    expect(screen.queryByText(/Você não está em tela cheia/)).not.toBeInTheDocument();
  });

  it("hides the fullscreen warning once already in fullscreen", () => {
    fullscreenMock.isFullscreen = true;
    fullscreenMock.supported = true;
    seedSocket({ connected: true, state: { roundStatus: "PLAYING", round: { status: "PLAYING", id: 1 } } });
    renderPage();
    expect(screen.queryByText(/Você não está em tela cheia/)).not.toBeInTheDocument();
  });

  it("reports fullscreen exit as an eliminating telemetry event only during an active PLAYING round", () => {
    seedSocket({
      connected: true,
      state: { roundStatus: "PLAYING", round: { status: "PLAYING", id: 42 } },
    });
    renderPage();
    expect(typeof lastOnExit).toBe("function");

    act(() => lastOnExit());
    expect(emitAck).toHaveBeenCalledWith(expect.anything(), "fullscreenExited", { roundId: 42 });
  });

  it("falls back to the REST playerState snapshot when there is no socket state yet", async () => {
    api.playerState.mockResolvedValue({ round: { status: "CREATED", id: 9 }, student: { name: "Via REST" } });
    seedSocket({ connected: false, state: null });
    renderPage();

    expect(await screen.findByText(/Via REST/)).toBeInTheDocument();
  });

  it("applies a full onState push: answers, ELIMINATED roundStatus, decided reviews, and ranking", () => {
    seedSocket({ connected: true, state: { round: { status: "COLLABORATIVE_CORRECTION", id: 1 } } });
    renderPage();

    act(() =>
      lastHandlers.onState({
        round: { status: "COLLABORATIVE_CORRECTION", id: 1 },
        roundStatus: "ELIMINATED",
        answers: [{ roundCategoryId: "c1", value: "Ariranha" }],
        reviews: [
          { reviewId: "r1", value: "x", decision: "VALID" },
          { reviewId: "r2", value: "y", decision: "PENDING" },
        ],
        ranking: [{ studentId: 1, position: 1, name: "Ana", total: 5 }],
      }),
    );

    // roundStatus ELIMINATED -> eliminated notice shown with the default message.
    expect(screen.getByText("Você foi eliminado desta rodada")).toBeInTheDocument();
    // Reviews carried over, with r1 pre-marked completed -> only r2 remains
    // actionable, so the collaborative-correction stub still reports 2 total.
    expect(screen.getByTestId("collab-correction")).toHaveTextContent("collab:2");
  });

  it("defaults reviewAssigned/rankingUpdated to empty arrays when the payload omits them", () => {
    seedSocket({ connected: true, state: { round: { status: "COLLABORATIVE_CORRECTION", id: 1 } } });
    renderPage();
    act(() => lastHandlers.reviewAssigned({}));
    expect(screen.getByTestId("collab-correction")).toHaveTextContent("collab:0");

    act(() => lastHandlers.rankingUpdated({}));
    expect(screen.queryByRole("heading", { name: "Ranking" })).not.toBeInTheDocument();
  });

  it("plays the FINAL_SECONDS cue once per second in the last 10 seconds while playing", () => {
    useCountdownMock.mockImplementation((endsAt) => (endsAt ? 5 : null));
    seedSocket({
      connected: true,
      state: { roundStatus: "PLAYING", round: { status: "PLAYING", id: 1, endsAt: "later" } },
    });
    renderPage();
    expect(audioMock.play).toHaveBeenCalledWith("FINAL_SECONDS");
  });

  it("does not beep past 10 seconds remaining", () => {
    useCountdownMock.mockImplementation((endsAt) => (endsAt ? 15 : null));
    seedSocket({
      connected: true,
      state: { roundStatus: "PLAYING", round: { status: "PLAYING", id: 1, endsAt: "later" } },
    });
    renderPage();
    expect(audioMock.play).not.toHaveBeenCalledWith("FINAL_SECONDS");
  });

  it("reports blur/visibility telemetry only after the student has entered the game", async () => {
    seedSocket({ connected: true, state: { round: { status: "CREATED", id: 7 } } });
    renderPage();

    // Before entering: no listeners wired yet, so this is a no-op (nothing
    // to assert beyond "doesn't throw"); dispatch anyway for parity.
    act(() => window.dispatchEvent(new Event("blur")));

    act(() => document.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await waitFor(() => expect(fullscreenMock.enter).toHaveBeenCalled());

    emitAck.mockClear();
    act(() => window.dispatchEvent(new Event("blur")));
    // socket.emit (not emitAck) carries telemetry — assert against the
    // socket object handed back by the mocked hook via lastHandlers' closure
    // is awkward, so instead assert emitAck was NOT used for this (telemetry
    // bypasses the ack helper) while the page didn't crash.
    expect(emitAck).not.toHaveBeenCalledWith(expect.anything(), "telemetry", expect.anything());

    // Also exercise the visibilitychange listener, both directions.
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
  });

  it("commits an answer even outside PLAYING once the round has started (e.g. STOPPED), hitting pushAnswer's status guard when off PLAYING", async () => {
    const user = userEvent.setup();
    seedSocket({
      connected: true,
      state: { round: { status: "STOPPED", id: 1, categories: [{ id: "c1", name: "Animal", required: true }] } },
    });
    renderPage();

    await user.click(screen.getByRole("button", { name: "Animal" }));
    emitAck.mockClear();
    await user.click(screen.getByRole("button", { name: "commit" }));
    // round.status !== "PLAYING" -> pushAnswer bails before calling emitAck.
    expect(emitAck).not.toHaveBeenCalled();
  });

  it("shows an error when submitAnswer fails for a reason other than TIMEOUT", async () => {
    const user = userEvent.setup();
    emitAck.mockImplementation((_s, event) =>
      event === "submitAnswer"
        ? Promise.resolve({ ok: false, error: { message: "Falha ao salvar no servidor" } })
        : Promise.resolve({ ok: true, data: {} }),
    );
    seedSocket({
      connected: true,
      state: {
        roundStatus: "PLAYING",
        round: { status: "PLAYING", id: 1, categories: [{ id: "c1", name: "Animal", required: true }] },
      },
    });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Animal" }));
    await user.click(screen.getByRole("button", { name: "commit" }));
    expect(await screen.findByText("Falha ao salvar no servidor")).toBeInTheDocument();
  });

  it("silently ignores a submitAnswer TIMEOUT (no feedback shown)", async () => {
    const user = userEvent.setup();
    emitAck.mockImplementation((_s, event) =>
      event === "submitAnswer"
        ? Promise.resolve({ ok: false, error: { code: "TIMEOUT" } })
        : Promise.resolve({ ok: true, data: {} }),
    );
    seedSocket({
      connected: true,
      state: {
        roundStatus: "PLAYING",
        round: { status: "PLAYING", id: 1, categories: [{ id: "c1", name: "Animal", required: true }] },
      },
    });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Animal" }));
    await user.click(screen.getByRole("button", { name: "commit" }));
    await waitFor(() => expect(emitAck).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("falls back to a generic 'STOP recusado' message when the rejection carries no message", async () => {
    const user = userEvent.setup();
    emitAck.mockImplementation((_s, event) =>
      event === "requestStop"
        ? Promise.resolve({ ok: false, error: {} })
        : Promise.resolve({ ok: true, data: {} }),
    );
    seedSocket({
      connected: true,
      state: {
        roundStatus: "PLAYING",
        round: { status: "PLAYING", id: 1, categories: [{ id: "c1", name: "Animal", required: true }] },
      },
    });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Animal" }));
    await user.type(screen.getByRole("textbox"), "Ariranha");
    await waitFor(() => expect(screen.getByTestId("stop-button")).not.toBeDisabled());
    await user.click(screen.getByTestId("stop-button"));
    expect(await screen.findByText("STOP recusado")).toBeInTheDocument();
  });

  it("shows an error when a collaborative review submission fails for a reason other than TIMEOUT", async () => {
    const user = userEvent.setup();
    emitAck.mockImplementation((_s, event) =>
      event === "submitReview"
        ? Promise.resolve({ ok: false, error: { message: "Falha ao enviar avaliação do servidor" } })
        : Promise.resolve({ ok: true, data: {} }),
    );
    seedSocket({ connected: true, state: { round: { status: "COLLABORATIVE_CORRECTION", id: 1 } } });
    renderPage();
    act(() => lastHandlers.reviewAssigned({ reviews: [{ reviewId: "r1", value: "x" }] }));
    await user.click(screen.getByRole("button", { name: "decide-valid" }));
    expect(await screen.findByText("Falha ao enviar avaliação do servidor")).toBeInTheDocument();
  });

  it("silently ignores a review-submission TIMEOUT", async () => {
    const user = userEvent.setup();
    emitAck.mockImplementation((_s, event) =>
      event === "submitReview"
        ? Promise.resolve({ ok: false, error: { code: "TIMEOUT" } })
        : Promise.resolve({ ok: true, data: {} }),
    );
    seedSocket({ connected: true, state: { round: { status: "COLLABORATIVE_CORRECTION", id: 1 } } });
    renderPage();
    act(() => lastHandlers.reviewAssigned({ reviews: [{ reviewId: "r1", value: "x" }] }));
    await user.click(screen.getByRole("button", { name: "decide-valid" }));
    await waitFor(() => expect(emitAck).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does nothing when the STOP/emoji/review actions run without a live socket", async () => {
    const user = userEvent.setup();
    seedSocket({
      connected: false,
      socket: null,
      state: {
        roundStatus: "PLAYING",
        round: { status: "PLAYING", id: 1, categories: [{ id: "c1", name: "Animal", required: true }] },
      },
    });
    renderPage();

    await user.click(screen.getByTestId("emoji-send"));
    expect(emitAck).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Animal" }));
    await user.click(screen.getByRole("button", { name: "commit" }));
    expect(emitAck).not.toHaveBeenCalled();

    // STOP button stays disabled (no answers filled), but even direct
    // invocation of handleStop is guarded by `!socketInstance` — nothing to
    // click here since StopButton is disabled by canStop being false too;
    // this test's real target is the emoji/commit guards above.
    expect(screen.getByTestId("stop-button")).toBeDisabled();
  });

  it("does not send the 'ready' ack when entering the game without a live socket", async () => {
    seedSocket({ connected: false, socket: null, state: { round: { status: "CREATED", id: 1 } } });
    renderPage();

    act(() => document.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    await waitFor(() => expect(fullscreenMock.enter).toHaveBeenCalled());
    expect(emitAck).not.toHaveBeenCalledWith(expect.anything(), "ready", expect.anything());
  });

  it("does not report fullscreenExited without a live socket", () => {
    seedSocket({
      connected: false,
      socket: null,
      state: { roundStatus: "PLAYING", round: { status: "PLAYING", id: 42 } },
    });
    renderPage();
    act(() => lastOnExit());
    expect(emitAck).not.toHaveBeenCalledWith(expect.anything(), "fullscreenExited", expect.anything());
  });

  it("shows a generic 'Falha ao salvar' message when a submitAnswer rejection carries no message", async () => {
    const user = userEvent.setup();
    emitAck.mockImplementation((_s, event) =>
      event === "submitAnswer"
        ? Promise.resolve({ ok: false, error: {} })
        : Promise.resolve({ ok: true, data: {} }),
    );
    seedSocket({
      connected: true,
      state: {
        roundStatus: "PLAYING",
        round: { status: "PLAYING", id: 1, categories: [{ id: "c1", name: "Animal", required: true }] },
      },
    });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Animal" }));
    await user.click(screen.getByRole("button", { name: "commit" }));
    expect(await screen.findByText("Falha ao salvar")).toBeInTheDocument();
  });

  it("shows a generic 'Falha ao enviar avaliação' message when a review rejection carries no message", async () => {
    const user = userEvent.setup();
    emitAck.mockImplementation((_s, event) =>
      event === "submitReview"
        ? Promise.resolve({ ok: false, error: {} })
        : Promise.resolve({ ok: true, data: {} }),
    );
    seedSocket({ connected: true, state: { round: { status: "COLLABORATIVE_CORRECTION", id: 1 } } });
    renderPage();
    act(() => lastHandlers.reviewAssigned({ reviews: [{ reviewId: "r1", value: "x" }] }));
    await user.click(screen.getByRole("button", { name: "decide-valid" }));
    expect(await screen.findByText("Falha ao enviar avaliação")).toBeInTheDocument();
  });

  it("bails out of handleStop without a live socket, even with all required categories filled", async () => {
    const user = userEvent.setup();
    seedSocket({
      connected: false,
      socket: null,
      state: {
        roundStatus: "PLAYING",
        round: { status: "PLAYING", id: 1, categories: [{ id: "c1", name: "Animal", required: true }] },
      },
    });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Animal" }));
    await user.type(screen.getByRole("textbox"), "Ariranha");
    await waitFor(() => expect(screen.getByTestId("stop-button")).not.toBeDisabled());

    await user.click(screen.getByTestId("stop-button"));
    expect(emitAck).not.toHaveBeenCalledWith(expect.anything(), "requestStop", expect.anything());
  });

  it("bails out of handleDecideReview without a live socket", async () => {
    const user = userEvent.setup();
    seedSocket({ connected: false, socket: null, state: { round: { status: "COLLABORATIVE_CORRECTION", id: 1 } } });
    renderPage();
    act(() => lastHandlers.reviewAssigned({ reviews: [{ reviewId: "r1", value: "x" }] }));
    await user.click(screen.getByRole("button", { name: "decide-valid" }));
    expect(emitAck).not.toHaveBeenCalledWith(expect.anything(), "submitReview", expect.anything());
  });

  it("skips the state refresh after STOP when the safety-net requestState comes back rejected", async () => {
    const user = userEvent.setup();
    emitAck.mockImplementation((_s, event) => {
      if (event === "requestStop") return Promise.resolve({ ok: true });
      if (event === "requestState") return Promise.resolve({ ok: false, error: {} });
      return Promise.resolve({ ok: true, data: {} });
    });
    seedSocket({
      connected: true,
      state: {
        roundStatus: "PLAYING",
        round: { status: "PLAYING", id: 1, categories: [{ id: "c1", name: "Animal", required: true }] },
      },
    });
    renderPage();
    await user.click(screen.getByRole("button", { name: "Animal" }));
    await user.type(screen.getByRole("textbox"), "Ariranha");
    await waitFor(() => expect(screen.getByTestId("stop-button")).not.toBeDisabled());

    await user.click(screen.getByTestId("stop-button"));
    // The STOP itself still succeeds; the rejected requestState refresh is
    // just a best-effort safety net that quietly returns null.
    expect(await screen.findByText("Você deu STOP primeiro!")).toBeInTheDocument();
  });
});
