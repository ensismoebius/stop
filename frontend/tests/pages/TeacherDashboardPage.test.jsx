import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  api,
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

  it("shows a loading state while checking a stored session", async () => {
    let resolveMe;
    window.localStorage.setItem("stop:admin", JSON.stringify({ token: "tok-1", teacher: { id: 1 } }));
    api.me.mockReturnValue(new Promise((resolve) => (resolveMe = resolve)));

    renderDashboard();
    expect(screen.getByText("Carregando...")).toBeInTheDocument();

    await act(async () => {
      resolveMe({ id: 1 });
    });
    await waitFor(() => expect(screen.queryByText("Carregando...")).not.toBeInTheDocument());
  });

  it("shows the login page when there is no authenticated session", () => {
    renderDashboard();
    expect(screen.getByRole("heading", { name: "Painel do professor" })).toBeInTheDocument();
  });

  it("loads the basics catalog on mount, and switches tabs via the header", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.listClasses.mockResolvedValue([{ id: 1, name: "9A" }]);
    api.listGames.mockResolvedValue([{ id: 1, name: "Jogo" }]);
    api.listCategorySets.mockResolvedValue([{ id: 1, name: "Set" }]);

    renderDashboard();

    expect(await screen.findByTestId("room-control")).toHaveTextContent("room-control:no-game:no-room:1");
    // control tab is the default; other tabs' panels aren't mounted yet.
    expect(screen.queryByTestId("category-sets-panel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Correção" }));
    expect(screen.getByTestId("grouped-correction-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Configuração" }));
    expect(screen.getByTestId("config-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Categorias" }));
    expect(screen.getByTestId("category-sets-panel")).toHaveTextContent("category-sets:1");

    await user.click(screen.getByRole("tab", { name: "Relatórios" }));
    expect(screen.getByTestId("reports-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Controle da partida" }));
    expect(screen.getByTestId("room-control")).toBeInTheDocument();
  });

  it("shows a dashboard-level error alert when loading the basics catalog fails", async () => {
    await loginSession();
    api.listClasses.mockRejectedValue(new Error("Falha ao listar turmas"));
    renderDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao listar turmas");
  });

  it("loads students for the selected class, and clears them when deselected", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.listStudents.mockResolvedValue([{ id: 1, name: "Ana" }]);
    renderDashboard();

    await user.click(await screen.findByRole("tab", { name: "Configuração" }));
    await user.click(screen.getByRole("button", { name: "cfg-select-class" }));
    await waitFor(() => expect(api.listStudents).toHaveBeenCalledWith("tok-1", 3));
    expect(await screen.findByTestId("config-panel")).toHaveTextContent("config-panel:0:1:3");
  });

  it("shows an error when loading students for the selected class fails", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.listStudents.mockRejectedValue(new Error("Falha ao listar alunos"));
    renderDashboard();
    await user.click(await screen.findByRole("tab", { name: "Configuração" }));
    await user.click(screen.getByRole("button", { name: "cfg-select-class" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao listar alunos");
  });

  it("loads the full student roster only once the Reports tab is opened", async () => {
    const user = userEvent.setup();
    await loginSession();
    renderDashboard();
    await screen.findByTestId("room-control");
    expect(api.listStudents).not.toHaveBeenCalledWith("tok-1");

    api.listStudents.mockResolvedValue([{ id: 1, name: "Ana" }, { id: 2, name: "Beto" }]);
    await user.click(screen.getByRole("tab", { name: "Relatórios" }));
    expect(await screen.findByTestId("reports-panel")).toHaveTextContent("reports:0:2:0:no-stats");
  });

  it("shows an error when loading the full student roster (Reports tab) fails", async () => {
    const user = userEvent.setup();
    await loginSession();
    renderDashboard();
    await screen.findByTestId("room-control");
    api.listStudents.mockRejectedValue(new Error("Falha ao listar todos os alunos"));
    await user.click(screen.getByRole("tab", { name: "Relatórios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao listar todos os alunos");
  });

  it("restores the previously selected game from localStorage on mount", async () => {
    window.localStorage.setItem("stop:teacher:game", "42");
    await loginSession();
    api.getGame.mockResolvedValue({ id: 42, name: "Jogo Salvo", rooms: [] });
    renderDashboard();
    expect(await screen.findByTestId("room-control")).toHaveTextContent("room-control:Jogo Salvo:no-room:0");
  });

  it("clears the stored game id when restoring it fails", async () => {
    window.localStorage.setItem("stop:teacher:game", "42");
    await loginSession();
    api.getGame.mockRejectedValue(new Error("nao encontrado"));
    renderDashboard();
    await screen.findByTestId("room-control");
    await waitFor(() => expect(window.localStorage.getItem("stop:teacher:game")).toBeNull());
  });

  it("prefers the OPEN room among a game's rooms, falling back to the first one", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.createGame.mockResolvedValue({ id: 1 });
    api.getGame.mockResolvedValue({
      id: 1,
      name: "Jogo",
      rooms: [
        { code: "CLOSED-1", status: "CLOSED" },
        { code: "OPEN-1", status: "OPEN" },
      ],
    });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-create-game" }));
    expect(await screen.findByTestId("room-control")).toHaveTextContent("room-control:Jogo:OPEN-1:0");
  });

  it("falls back to the first room when none is OPEN", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.createGame.mockResolvedValue({ id: 1 });
    api.getGame.mockResolvedValue({
      id: 1,
      name: "Jogo",
      rooms: [{ code: "CLOSED-1", status: "CLOSED" }],
    });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-create-game" }));
    expect(await screen.findByTestId("room-control")).toHaveTextContent("room-control:Jogo:CLOSED-1:0");
  });

  it("loads the QR code once a room exists, defaulting to null on failure", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.createGame.mockResolvedValue({ id: 1 });
    api.getGame.mockResolvedValue({ id: 1, name: "Jogo", rooms: [{ code: "R1", status: "OPEN" }] });
    api.roomQrCode.mockRejectedValueOnce(new Error("falhou"));
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-create-game" }));
    await waitFor(() => expect(api.roomQrCode).toHaveBeenCalledWith("tok-1", "R1"));
  });

  it("loads used letters for the game, defaulting to an empty list", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.createGame.mockResolvedValue({ id: 1 });
    api.getGame.mockResolvedValue({ id: 1, name: "Jogo", rooms: [{ code: "R1", status: "OPEN" }] });
    api.usedLetters.mockResolvedValue({ usedLetters: ["A", "B"] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-create-game" }));
    expect(await screen.findByTestId("round-control")).toHaveTextContent("round-control:no-round:enabled:2");
  });

  it("defaults used letters to empty when the API call fails", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.createGame.mockResolvedValue({ id: 1 });
    api.getGame.mockResolvedValue({ id: 1, name: "Jogo", rooms: [{ code: "R1", status: "OPEN" }] });
    api.usedLetters.mockRejectedValueOnce(new Error("falhou"));
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-create-game" }));
    expect(await screen.findByTestId("round-control")).toHaveTextContent("round-control:no-round:enabled:0");
  });

  it("creates a game (guarded): calls createGame, getGame, and reloads the catalog", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.createGame.mockResolvedValue({ id: 1 });
    api.getGame.mockResolvedValue({ id: 1, name: "Jogo Novo", rooms: [] });
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "rc-create-game" }));
    expect(api.createGame).toHaveBeenCalledWith("tok-1", { name: "Nova", classId: 1 });
    expect(api.getGame).toHaveBeenCalledWith("tok-1", 1);
    await waitFor(() => expect(api.listClasses).toHaveBeenCalledTimes(2)); // mount + loadBasics from createGame
    expect(await screen.findByTestId("room-control")).toHaveTextContent("Jogo Novo");
  });

  it("shows an error and clears busy when a guarded action rejects", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.createGame.mockRejectedValue(new Error("Falha ao criar partida"));
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-create-game" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha ao criar partida");
  });

  it("falls back to a generic error message when a guarded rejection carries none", async () => {
    const user = userEvent.setup();
    await loginSession();
    // A plain rejection value has no `.message` at all (unlike `new
    // Error()`, whose `.message` is `""` — falsy but not nullish, so it
    // would NOT trigger the `??` fallback).
    api.createGame.mockRejectedValue({});
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-create-game" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha na operação");
  });

  it("selects an existing game (unguarded — no busy flag), and clears it via 'Trocar'", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [] });
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    expect(api.getGame).toHaveBeenCalledWith("tok-1", 5);
    expect(await screen.findByTestId("room-control")).toHaveTextContent("Jogo 5");

    await user.click(screen.getByRole("button", { name: "rc-clear-game" }));
    expect(await screen.findByTestId("room-control")).toHaveTextContent("room-control:no-game:no-room:0");
    expect(window.localStorage.getItem("stop:teacher:game")).toBeNull();
  });

  it("creates a room for the current game", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));

    api.createRoom.mockResolvedValue({ code: "NEW-ROOM" });
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "NEW-ROOM", status: "OPEN" }] });
    await user.click(screen.getByRole("button", { name: "rc-create-room" }));
    expect(api.createRoom).toHaveBeenCalledWith("tok-1", 5);
    expect(await screen.findByTestId("room-control")).toHaveTextContent("NEW-ROOM");
  });

  it("finishes the game via the quick-actions bar, after confirmation", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", status: "OPEN", rooms: [] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));

    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Finalizar partida" }));
    expect(api.finishGame).not.toHaveBeenCalled();

    window.confirm.mockReturnValueOnce(true);
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", status: "FINISHED", rooms: [] });
    await user.click(screen.getByRole("button", { name: "Finalizar partida" }));
    expect(api.finishGame).toHaveBeenCalledWith("tok-1", 5);
  });

  it("hides the 'Finalizar partida' button once the game is FINISHED", async () => {
    // Clicar de novo numa partida ja encerrada nao faz nada de util e so
    // confunde: o botao some e da lugar a um aviso de partida encerrada.
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", status: "FINISHED", rooms: [] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));

    expect(screen.queryByRole("button", { name: "Finalizar partida" })).not.toBeInTheDocument();
    expect(screen.getByText("Partida encerrada")).toBeInTheDocument();
  });

  it("offers 'Nova partida' once the game is FINISHED, clearing the selected game", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", status: "FINISHED", rooms: [] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));

    const novaPartida = screen.getByRole("button", { name: "Nova partida" });
    expect(novaPartida).toBeInTheDocument();

    await user.click(novaPartida);
    // Sem partida selecionada, a barra de acoes some e volta o seletor.
    await waitFor(() => expect(screen.queryByText("Ações rápidas")).not.toBeInTheDocument());
  });

  it("exposes the game phase as a visible status badge", async () => {
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", status: "ACTIVE", rooms: [] });
    renderDashboard();
    await userEvent.setup().click(await screen.findByRole("button", { name: "rc-select-game" }));

    expect(screen.getByText("Partida aberta")).toBeInTheDocument();
    expect(screen.getByText("Jogo 5")).toBeInTheDocument();
  });

  it("wires the tablist to its panels and moves between tabs with arrow keys", async () => {
    const user = userEvent.setup();
    await loginSession();
    renderDashboard();

    const tabs = await screen.findAllByRole("tab");
    const selected = tabs.find((tab) => tab.getAttribute("aria-selected") === "true");
    // Cada aba controla um painel, e o painel aponta de volta para a aba.
    expect(selected).toHaveAttribute("aria-controls", "panel-control");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "tab-control");
    // Roving tabindex: so a aba ativa participa da navegacao por Tab.
    expect(selected).toHaveAttribute("tabindex", "0");
    expect(tabs.filter((tab) => tab !== selected)[0]).toHaveAttribute("tabindex", "-1");

    selected.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "tab-correction");

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "tab-control");
  });

  it("hides quick actions entirely without a selected game", async () => {
    await loginSession();
    renderDashboard();
    await screen.findByTestId("room-control");
    expect(screen.queryByText("Ações rápidas")).not.toBeInTheDocument();
  });

  it("shows 'Finalizar rodada' only while a round is PLAYING", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    await screen.findByTestId("round-control");
    expect(screen.queryByRole("button", { name: "Finalizar rodada" })).not.toBeInTheDocument();

    seedSocket({ connected: true, state: { round: { status: "PLAYING", id: 1 } } });
    act(() => pushRoomState({ round: { status: "PLAYING", id: 1 } }));
  });

  it("creates a round, draws a letter, starts, and stops it", async () => {
    const user = userEvent.setup();
    await loginSession();
    api.getGame.mockResolvedValue({ id: 5, name: "Jogo 5", rooms: [{ code: "R1", status: "OPEN" }] });
    renderDashboard();
    await user.click(await screen.findByRole("button", { name: "rc-select-game" }));
    await screen.findByTestId("round-control");

    await user.click(screen.getByRole("button", { name: "rc-create-round" }));
    expect(api.createRound).toHaveBeenCalledWith("tok-1", { categorySetId: 1, durationSeconds: 60, gameId: 5 });

    seedSocket({ connected: true, state: { round: { id: 9, status: "CREATED" } } });
    act(() => pushRoomState({ round: { id: 9, status: "CREATED" } }));

    api.drawLetter.mockResolvedValue({ usedLetters: ["A"] });
    await user.click(screen.getByRole("button", { name: "rc-draw-letter" }));
    expect(api.drawLetter).toHaveBeenCalledWith("tok-1", 9);

    await user.click(screen.getByRole("button", { name: "rc-start" }));
    expect(api.startRound).toHaveBeenCalledWith("tok-1", 9);

    await user.click(screen.getByRole("button", { name: "rc-stop" }));
    expect(api.stopRound).toHaveBeenCalledWith("tok-1", 9);
  });

});
