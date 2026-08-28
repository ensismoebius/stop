import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  api,
  getLastHandlers,
  loginSession,
  pushRoomState,
  renderDashboard,
  resetSetup,
  seedSocket,
  teardown,
} from "./TeacherDashboardPage.test.helpers.jsx";

describe("TeacherDashboardPage", () => {
  beforeEach(() => {
    resetSetup();
  });

  afterEach(() => {
    teardown();
  });

  it("cancels a round: resets grids and switches back to the control tab", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    seedSocket({ connected: true, state: { round: { id: 9, status: "CREATED" } } });
    act(() => pushRoomState({ round: { id: 9, status: "CREATED" } }));

    await user.click(screen.getByRole("button", { name: "rc-cancel" }));
    expect(api.cancelRound).toHaveBeenCalledWith("tok-1", 9);
  });

  it("routes to the correction tab and loads the grid on roundStopped/roundTimedOut", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    api.correctionGrid.mockResolvedValue({ players: [] });
    api.groupedCorrectionGrid.mockResolvedValue({ categories: [] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    await screen.findByTestId("round-control");

    await act(async () => { getLastHandlers().roundStopped({ roundId: 9 }); });
    await waitFor(() => expect(api.correctionGrid).toHaveBeenCalledWith("tok-1", 9));
    expect(await screen.findByTestId("grouped-correction-panel")).toBeInTheDocument();
  });

  it("routes to the correction tab on roundTimedOut too", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    api.correctionGrid.mockResolvedValue({ players: [] });
    api.groupedCorrectionGrid.mockResolvedValue({ categories: [] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    await screen.findByTestId("round-control");

    await act(async () => { getLastHandlers().roundTimedOut({ roundId: 9 }); });
    expect(await screen.findByTestId("grouped-correction-panel")).toBeInTheDocument();
  });

  it("clears the correction grid when the grid API call fails", async () => {
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    api.correctionGrid.mockRejectedValue(new Error("falhou"));
    api.groupedCorrectionGrid.mockResolvedValue({ categories: [] });
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    await screen.findByTestId("round-control");
    await act(async () => { getLastHandlers().roundStopped({ roundId: 9 }); });
    await waitFor(() => expect(api.correctionGrid).toHaveBeenCalled());
    expect(await screen.findByTestId("grouped-correction-panel")).toHaveTextContent("no-grid");
  });

  it("auto-loads the grid when the round enters STOPPED/CORRECTION/SCORED without one yet", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    api.correctionGrid.mockResolvedValue({ players: [] });
    api.groupedCorrectionGrid.mockResolvedValue({ categories: [] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    await screen.findByTestId("round-control");

    seedSocket({ connected: true, state: { round: { id: 11, status: "CORRECTION" } } });
    act(() => pushRoomState({ round: { id: 11, status: "CORRECTION" } }));
    await waitFor(() => expect(api.correctionGrid).toHaveBeenCalledWith("tok-1", 11));
  });

  it("tracks collaborative-correction progress and lets the teacher finish it early", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    seedSocket({ connected: true, state: { round: { id: 9, status: "COLLABORATIVE_CORRECTION" } } });
    act(() => pushRoomState({ round: { id: 9, status: "COLLABORATIVE_CORRECTION" } }));
    act(() => getLastHandlers().collaborativeCorrectionStarted({ completedAssignments: 1, totalAssignments: 3 }));

    await user.click(screen.getByRole("button", { name: "rc-finish-collab" }));
    expect(api.finishCollaborativeCorrection).toHaveBeenCalledWith("tok-1", 9);

    act(() => getLastHandlers().collaborativeCorrectionFinished());
  });

  it("updates collaborative-correction progress on collaborativeCorrectionProgress events", async () => {
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    seedSocket({ connected: true, state: { round: { id: 9, status: "COLLABORATIVE_CORRECTION" } } });
    act(() => pushRoomState({ round: { id: 9, status: "COLLABORATIVE_CORRECTION" } }));
    act(() => getLastHandlers().collaborativeCorrectionProgress({ completedAssignments: 2, totalAssignments: 3 }));
    expect(await screen.findByTestId("round-control")).toHaveTextContent("COLLABORATIVE_CORRECTION");
  });

  it("switches the correction view back to the grouped tab", async () => {
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    api.correctionGrid.mockResolvedValue({ players: [] });
    api.groupedCorrectionGrid.mockResolvedValue({ categories: [] });
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    act(() => pushRoomState({ round: { id: 9, status: "STOPPED" } }));
    await waitFor(() => expect(api.correctionGrid).toHaveBeenCalled());

    await user.click(screen.getByRole("tab", { name: "Correção" }));
    await user.click(screen.getByRole("tab", { name: "Grade por aluno" }));
    expect(await screen.findByTestId("correction-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Agregada por resposta" }));
    expect(await screen.findByTestId("grouped-correction-panel")).toBeInTheDocument();
  });

  it("resets collaborative-correction progress and reloads the grid on correctionStarted", async () => {
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    api.correctionGrid.mockResolvedValue({ players: [] });
    api.groupedCorrectionGrid.mockResolvedValue({ categories: [] });
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    await act(async () => { getLastHandlers().correctionStarted({ roundId: 9 }); });
    await waitFor(() => expect(api.correctionGrid).toHaveBeenCalledWith("tok-1", 9));
  });

  it("reloads the grid on answerReviewed/answersReviewed", async () => {
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    api.correctionGrid.mockResolvedValue({ players: [] });
    api.groupedCorrectionGrid.mockResolvedValue({ categories: [] });
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));

    await act(async () => { getLastHandlers().answerReviewed({ roundId: 9 }); });
    await waitFor(() => expect(api.correctionGrid).toHaveBeenCalledWith("tok-1", 9));

    api.correctionGrid.mockClear();
    await act(async () => { getLastHandlers().answersReviewed({ roundId: 9 }); });
    await waitFor(() => expect(api.correctionGrid).toHaveBeenCalledWith("tok-1", 9));
  });

  it("reloads the game on letterSelected/scoreUpdated", async () => {
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [] });
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    api.getGame.mockClear();
    api.usedLetters.mockClear();

    await act(async () => { getLastHandlers().letterSelected(); });
    await waitFor(() => expect(api.getGame).toHaveBeenCalledWith("tok-1", 5));

    api.getGame.mockClear();
    await act(async () => { getLastHandlers().scoreUpdated(); });
    await waitFor(() => expect(api.getGame).toHaveBeenCalledWith("tok-1", 5));
  });

  it("resets grids/collab/tab and reloads the game on nextRound/roundCancelled socket events", async () => {
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [] });
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    await user.click(screen.getByRole("tab", { name: "Correção" }));
    expect(screen.getByTestId("grouped-correction-panel")).toBeInTheDocument();

    api.getGame.mockClear();
    await act(async () => { getLastHandlers().nextRound(); });
    await waitFor(() => expect(api.getGame).toHaveBeenCalled());
    expect(await screen.findByTestId("room-control")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Correção" }));
    api.getGame.mockClear();
    await act(async () => { getLastHandlers().roundCancelled(); });
    await waitFor(() => expect(api.getGame).toHaveBeenCalled());
    expect(await screen.findByTestId("room-control")).toBeInTheDocument();
  });

  it("pushes an emoji burst on emojiReceived", async () => {
    await loginSession();
    renderDashboard();
    await screen.findByTestId("room-control");
    act(() => getLastHandlers().emojiReceived({ emoji: "🎉" }));
    expect(screen.getByTestId("emoji-bursts")).toHaveTextContent("1");
  });

  it("shows an error via handlers.onError", async () => {
    await loginSession();
    renderDashboard();
    await screen.findByTestId("room-control");
    act(() => getLastHandlers().onError({ message: "Erro de sala" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Erro de sala");
  });

  it("falls back to the REST teacherState snapshot when there is no live socket state", async () => {
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    api.teacherState.mockResolvedValue({ round: { status: "READY", id: 3 }, players: [{ id: 1 }] });
    const user = userEvent.setup();
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    expect(await screen.findByTestId("round-control")).toHaveTextContent("round-control:READY");
    expect(screen.getByTestId("player-monitor")).toHaveTextContent("player-monitor:1:0");
  });

  it("defaults player-monitor/ranking-panel props when the view has none", async () => {
    await loginSession();
    renderDashboard();
    await screen.findByTestId("room-control");
    expect(screen.getByTestId("player-monitor")).toHaveTextContent("player-monitor:0:0");
    expect(screen.getByTestId("ranking-panel")).toHaveTextContent("ranking-panel:0");
  });

  it("scores the round and returns to the control tab", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    seedSocket({ connected: true, state: { round: { id: 9, status: "CORRECTION" } } });
    act(() => pushRoomState({ round: { id: 9, status: "CORRECTION" } }));

    await user.click(screen.getByRole("button", { name: "rc-score" }));
    expect(api.scoreRound).toHaveBeenCalledWith("tok-1", 9);
    expect(await screen.findByTestId("room-control")).toBeInTheDocument();
  });

  it("advances to the next round with the chosen theme/duration", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));

    await user.click(screen.getByRole("button", { name: "rc-next-round" }));
    expect(api.nextRound).toHaveBeenCalledWith("tok-1", 5, { categorySetId: 2, durationSeconds: 90 });
  });

  it("goes to the correction tab from RoundControl's link", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    await user.click(screen.getByRole("button", { name: "rc-goto-correction" }));
    expect(screen.getByTestId("grouped-correction-panel")).toBeInTheDocument();
  });

  it("toggles between the grouped and per-student correction views", async () => {
    const user = userEvent.setup();
    await loginSession();
    renderDashboard();
    await screen.findByTestId("room-control");
    await user.click(screen.getByRole("tab", { name: "Correção" }));
    expect(screen.getByTestId("grouped-correction-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("correction-panel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Grade por aluno" }));
    expect(screen.getByTestId("correction-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("grouped-correction-panel")).not.toBeInTheDocument();
  });

  it("reviews a single answer, optimistically patching the grid in place", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    api.correctionGrid.mockResolvedValue({
      players: [{ answers: [{ id: "a1", reviewState: "PENDING" }] }],
    });
    api.groupedCorrectionGrid.mockResolvedValue({ categories: [] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    seedSocket({ connected: true, state: { round: { id: 9, status: "STOPPED" } } });
    act(() => pushRoomState({ round: { id: 9, status: "STOPPED" } }));
    await waitFor(() => expect(api.correctionGrid).toHaveBeenCalled());

    await user.click(screen.getByRole("tab", { name: "Correção" }));
    await user.click(screen.getByRole("tab", { name: "Grade por aluno" }));
    await user.click(screen.getByRole("button", { name: "cp-review" }));
    expect(api.reviewAnswer).toHaveBeenCalledWith("tok-1", "a1", "VALID");
    expect(screen.getByTestId("correction-panel")).toHaveTextContent("has-grid");
  });

  it("leaves a null grid untouched when reviewing without one loaded", async () => {
    const user = userEvent.setup();
    await loginSession();
    renderDashboard();
    await screen.findByTestId("room-control");
    await user.click(screen.getByRole("tab", { name: "Correção" }));
    await user.click(screen.getByRole("tab", { name: "Grade por aluno" }));
    await user.click(screen.getByRole("button", { name: "cp-review" }));
    expect(api.reviewAnswer).toHaveBeenCalled();
    expect(screen.getByTestId("correction-panel")).toHaveTextContent("no-grid");
  });

  it("reviews a group and reloads the grid", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    api.correctionGrid.mockResolvedValue({ players: [] });
    api.groupedCorrectionGrid.mockResolvedValue({ categories: [] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    seedSocket({ connected: true, state: { round: { id: 9, status: "STOPPED" } } });
    act(() => pushRoomState({ round: { id: 9, status: "STOPPED" } }));
    await waitFor(() => expect(api.correctionGrid).toHaveBeenCalled());

    await user.click(screen.getByRole("tab", { name: "Correção" }));
    api.correctionGrid.mockClear();
    await user.click(screen.getByRole("button", { name: "gcp-review-group" }));
    expect(api.reviewAnswers).toHaveBeenCalledWith("tok-1", [
      { answerId: "a1", reviewState: "INVALID" },
      { answerId: "a2", reviewState: "INVALID" },
    ]);
    await waitFor(() => expect(api.correctionGrid).toHaveBeenCalledWith("tok-1", 9));
  });

  it("shows 'Pontuar rodada' in the Correction tab only for CORRECTION/STOPPED rounds", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    await user.click(screen.getByRole("tab", { name: "Correção" }));
    expect(screen.queryByRole("button", { name: "Pontuar rodada e atualizar ranking" })).not.toBeInTheDocument();

    seedSocket({ connected: true, state: { round: { id: 9, status: "STOPPED" } } });
    act(() => pushRoomState({ round: { id: 9, status: "STOPPED" } }));
    expect(screen.getByRole("button", { name: "Pontuar rodada e atualizar ranking" })).toBeInTheDocument();
  });

  it("loads statistics/history when opening the Configuração tab, and on SCORED rounds even off that tab", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [] });
    api.gameStatistics.mockResolvedValue({ totals: { rounds: 1 } });
    api.gameHistory.mockResolvedValue({ rounds: [{ id: "r1" }] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));

    await user.click(screen.getByRole("tab", { name: "Configuração" }));
    expect(await screen.findByTestId("statistics-panel")).toHaveTextContent("has-stats");

    await user.click(screen.getByRole("tab", { name: "Controle da partida" }));
    api.gameStatistics.mockClear();
    seedSocket({ connected: true, state: { round: { id: 9, status: "SCORED" } } });
    act(() => pushRoomState({ round: { id: 9, status: "SCORED" } }));
    await waitFor(() => expect(api.gameStatistics).toHaveBeenCalled());
  });

  it("shows an error when loading statistics/history fails", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [] });
    api.gameStatistics.mockRejectedValue(new Error("Falha ao carregar estatísticas"));
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    await user.click(screen.getByRole("tab", { name: "Configuração" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao carregar estatísticas");
  });

});
