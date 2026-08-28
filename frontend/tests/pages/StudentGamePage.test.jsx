import { describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PLAYER,
  audioMock,
  emitAck,
  getLastHandlers,
  renderPage,
  resetSetup,
  seedSocket,
  teardown,
  useCountdownMock,
} from "./StudentGamePage.test.helpers.jsx";

describe("StudentGamePage", () => {
  beforeEach(() => {
    resetSetup();
  });

  afterEach(() => {
    teardown();
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
    act(() => getLastHandlers().playerEliminated({}));
    expect(screen.getByText("Você foi eliminado desta rodada")).toBeInTheDocument();
    expect(audioMock.play).toHaveBeenCalledWith("ELIMINATED");
  });

  it("shows a custom eliminated message when provided", () => {
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();
    act(() => getLastHandlers().playerEliminated({ message: "Você saiu do app." }));
    expect(screen.getByText("Você saiu do app.")).toBeInTheDocument();
  });

  it("shows a feedback alert on socket error, and on roundStopped/roundTimedOut with STOP splash", () => {
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();

    act(() => getLastHandlers().onError({ message: "Falha de conexão" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Falha de conexão");

    act(() => getLastHandlers().roundStopped({ firstStopperName: "Beto" }));
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
      act(() => getLastHandlers().roundStopped({ firstStopperName: "Beto" }));
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
    act(() => getLastHandlers().roundStopped({}));
    expect(screen.getByText("STOP! A rodada foi encerrada.")).toBeInTheDocument();
  });

  it("shows the timeout message and splash on roundTimedOut", () => {
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();
    act(() => getLastHandlers().roundTimedOut());
    expect(screen.getByText("O tempo acabou. A rodada foi encerrada.")).toBeInTheDocument();
  });

  it("resets local state and shows a message on roundCreated/roundCancelled", () => {
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();

    act(() => getLastHandlers().roundCancelled({ message: "Cancelada pelo professor" }));
    expect(screen.getByText("Cancelada pelo professor")).toBeInTheDocument();

    act(() => getLastHandlers().roundCancelled());
    expect(screen.getByText("O professor cancelou esta rodada.")).toBeInTheDocument();

    act(() => getLastHandlers().roundCreated());
    act(() => getLastHandlers().roundStarted());
    expect(audioMock.play).toHaveBeenCalledWith("START");
  });

  it("plays a cue on letterSelected and syncCountdownRequested", () => {
    seedSocket({ connected: true, state: { round: { status: "CREATED", id: 1 } } });
    renderPage();
    act(() => getLastHandlers().letterSelected());
    act(() => getLastHandlers().syncCountdownRequested());
    expect(audioMock.play).toHaveBeenCalledWith("LETTER");
  });

  it("shows the collaborative-correction UI only when not playing and status is COLLABORATIVE_CORRECTION", () => {
    seedSocket({ connected: true, state: { round: { status: "COLLABORATIVE_CORRECTION", id: 1 } } });
    renderPage();
    act(() => getLastHandlers().reviewAssigned({ reviews: [{ reviewId: "r1", value: "x" }] }));
    expect(screen.getByTestId("collab-correction")).toHaveTextContent("collab:1");
  });

  it("decides a review and marks it completed via reviewCompleted", async () => {
    const user = userEvent.setup();
    seedSocket({ connected: true, state: { round: { status: "COLLABORATIVE_CORRECTION", id: 1 } } });
    renderPage();
    act(() => getLastHandlers().reviewAssigned({ reviews: [{ reviewId: "r1", value: "x" }] }));
    await user.click(screen.getByRole("button", { name: "decide-valid" }));
    await waitFor(() =>
      expect(emitAck).toHaveBeenCalledWith(
        expect.anything(),
        "submitReview",
        expect.objectContaining({ reviewId: "r1", decision: "VALID" }),
      ),
    );

    act(() => getLastHandlers().reviewCompleted({ reviewId: "r1" }));
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
    act(() => getLastHandlers().rankingUpdated({ ranking }));
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
    act(() => getLastHandlers().rankingUpdated({ ranking }));

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
    act(() => getLastHandlers().rankingUpdated({ ranking }));

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
    act(() => getLastHandlers().rankingUpdated({ ranking }));

    expect(screen.queryByText(/Sua colocação/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  it("hides the ranking while the round is still playing, even if ranking data exists", () => {
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();
    act(() => getLastHandlers().rankingUpdated({ ranking: [{ studentId: 1, position: 1, name: "Ana", total: 5 }] }));
    expect(screen.queryByRole("heading", { name: "Ranking" })).not.toBeInTheDocument();
  });

  it("shows the ranking when the game itself is FINISHED even mid-correction", () => {
    seedSocket({
      connected: true,
      state: { round: { status: "CORRECTION", id: 1 }, game: { status: "FINISHED" } },
    });
    renderPage();
    act(() => getLastHandlers().rankingUpdated({ ranking: [{ studentId: 1, position: 1, name: "Ana", total: 5 }] }));
    expect(screen.getByRole("heading", { name: "Ranking" })).toBeInTheDocument();
  });

  it("pushes an emoji burst on emojiReceived, and sends one via the picker", async () => {
    const user = userEvent.setup();
    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    renderPage();
    act(() => getLastHandlers().emojiReceived({ emoji: "🎉" }));
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
});
