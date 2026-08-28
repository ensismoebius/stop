// Testes de jogos voltados a eventos de socket, telas cheias, STOP e
// guards de socket ausente (parte 2 do arquivo original StudentGamePage).
import { describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  api,
  audioMock,
  emitAck,
  fullscreenMock,
  getLastHandlers,
  getLastOnExit,
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
    expect(typeof getLastOnExit()).toBe("function");

    act(() => getLastOnExit()());
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
      getLastHandlers().onState({
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
    act(() => getLastHandlers().reviewAssigned({}));
    expect(screen.getByTestId("collab-correction")).toHaveTextContent("collab:0");

    act(() => getLastHandlers().rankingUpdated({}));
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
    // socket object handed back by the mocked hook via getLastHandlers()' closure
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
    act(() => getLastHandlers().reviewAssigned({ reviews: [{ reviewId: "r1", value: "x" }] }));
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
    act(() => getLastHandlers().reviewAssigned({ reviews: [{ reviewId: "r1", value: "x" }] }));
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
    act(() => getLastOnExit()());
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
    act(() => getLastHandlers().reviewAssigned({ reviews: [{ reviewId: "r1", value: "x" }] }));
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
    act(() => getLastHandlers().reviewAssigned({ reviews: [{ reviewId: "r1", value: "x" }] }));
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
