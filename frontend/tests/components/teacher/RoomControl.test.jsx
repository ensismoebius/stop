import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RoomControl from "../../../src/components/teacher/RoomControl.jsx";

const classes = [
  { id: 1, name: "9A", _count: { enrollments: 20 } },
  { id: 2, name: "9B" },
];

describe("RoomControl", () => {
  it("shows the game creation form and existing-game resume list when there is no active game", async () => {
    const user = userEvent.setup();
    const onCreateGame = vi.fn();
    const onSelectGame = vi.fn();
    const games = [
      { id: 10, name: "Jogo A", status: "OPEN", class: { name: "9A" }, _count: { rounds: 2 } },
      { id: 11, name: "Jogo Finalizado", status: "FINISHED", class: { name: "9A" } },
      { id: 12, name: "Jogo Sem Turma", status: "OPEN" },
    ];

    render(
      <RoomControl
        classes={classes}
        games={games}
        game={null}
        room={null}
        qrCode={null}
        onCreateGame={onCreateGame}
        onSelectGame={onSelectGame}
        onCreateRoom={vi.fn()}
        busy={false}
      />,
    );

    // Finished games are filtered out of the resume list.
    expect(screen.getByText(/Jogo A/)).toBeInTheDocument();
    expect(screen.queryByText(/Jogo Finalizado/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Nova partida"), "  Revisão  ");
    await user.selectOptions(screen.getByLabelText("Turma"), "1");
    await user.click(screen.getByRole("button", { name: "Criar partida" }));

    expect(onCreateGame).toHaveBeenCalledWith({ name: "Revisão", classId: 1 });
    expect(screen.getByLabelText("Nova partida")).toHaveValue("");

    await user.click(screen.getByRole("button", { name: /Jogo A/ }));
    expect(onSelectGame).toHaveBeenCalledWith(games[0]);
  });

  it("disables the create-game button while classId is unset or busy", () => {
    render(
      <RoomControl
        classes={classes}
        games={[]}
        game={null}
        room={null}
        qrCode={null}
        onCreateGame={vi.fn()}
        onSelectGame={vi.fn()}
        onCreateRoom={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Criar partida" })).toBeDisabled();
  });

  it("hides the resume list when there are no resumable games", () => {
    render(
      <RoomControl
        classes={classes}
        games={[{ id: 1, name: "Jogo", status: "FINISHED", class: { name: "9A" } }]}
        game={null}
        room={null}
        qrCode={null}
        onCreateGame={vi.fn()}
        onSelectGame={vi.fn()}
        onCreateRoom={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.queryByText("Ou continue uma partida existente")).not.toBeInTheDocument();
  });

  it("shows the create-room button when a game is selected but no room exists yet", async () => {
    const user = userEvent.setup();
    const onCreateRoom = vi.fn();
    const onSelectGame = vi.fn();

    render(
      <RoomControl
        classes={classes}
        games={[]}
        game={{ id: 1, name: "Jogo A", class: { name: "9A" } }}
        room={null}
        qrCode={null}
        onCreateGame={vi.fn()}
        onSelectGame={onSelectGame}
        onCreateRoom={onCreateRoom}
        busy={false}
      />,
    );

    expect(screen.getByText("Jogo A")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Criar sala e gerar QR Code" }));
    expect(onCreateRoom).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Trocar" }));
    expect(onSelectGame).toHaveBeenCalledWith(null);
  });

  it("shows the QR code, room code and public-screen link once a room exists", () => {
    render(
      <RoomControl
        classes={classes}
        games={[]}
        game={{ id: 1, name: "Jogo A", class: { name: "9A" } }}
        room={{ code: "STOP-77" }}
        qrCode={{ dataUrl: "data:image/png;base64,xxx", url: "http://x/join/STOP-77" }}
        onCreateGame={vi.fn()}
        onSelectGame={vi.fn()}
        onCreateRoom={vi.fn()}
        busy={false}
      />,
    );

    expect(screen.getByText("STOP-77")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /QR Code de entrada da sala STOP-77/ })).toHaveAttribute(
      "src",
      "data:image/png;base64,xxx",
    );
    expect(screen.getByText("http://x/join/STOP-77")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir tela pública" })).toHaveAttribute(
      "href",
      "/screen/STOP-77",
    );
  });

  it("shows the room as closed (no QR, no join URL) once the game is FINISHED", () => {
    // A sala fecha junto com a partida. Continuar mostrando QR Code e URL
    // de entrada seria mentira: quem tentasse entrar levaria erro.
    render(
      <RoomControl
        classes={classes}
        games={[]}
        game={{ id: 1, name: "Jogo A", status: "FINISHED", class: { name: "9A" } }}
        room={{ code: "STOP-77", status: "CLOSED" }}
        qrCode={{ dataUrl: "data:image/png;base64,xxx", url: "http://x/join/STOP-77" }}
        onCreateGame={vi.fn()}
        onSelectGame={vi.fn()}
        onCreateRoom={vi.fn()}
        busy={false}
      />,
    );

    expect(screen.getByText(/Sala encerrada/)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /QR Code/ })).not.toBeInTheDocument();
    expect(screen.queryByText("http://x/join/STOP-77")).not.toBeInTheDocument();
    // A tela publica continua acessivel — e onde fica o podio final.
    expect(screen.getByRole("link", { name: "Abrir tela pública" })).toHaveAttribute(
      "href",
      "/screen/STOP-77",
    );
  });

  it("shows the room as closed when the room itself is CLOSED, even if the game is not", () => {
    render(
      <RoomControl
        classes={classes}
        games={[]}
        game={{ id: 1, name: "Jogo A", status: "ACTIVE", class: { name: "9A" } }}
        room={{ code: "STOP-77", status: "CLOSED" }}
        qrCode={{ dataUrl: "data:image/png;base64,xxx", url: "http://x/join/STOP-77" }}
        onCreateGame={vi.fn()}
        onSelectGame={vi.fn()}
        onCreateRoom={vi.fn()}
        busy={false}
      />,
    );

    expect(screen.getByText(/Sala encerrada/)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /QR Code/ })).not.toBeInTheDocument();
  });

  it("renders the room card without a QR image when qrCode is missing", () => {
    render(
      <RoomControl
        classes={classes}
        games={[]}
        game={{ id: 1, name: "Jogo A", class: { name: "9A" } }}
        room={{ code: "STOP-77" }}
        qrCode={null}
        onCreateGame={vi.fn()}
        onSelectGame={vi.fn()}
        onCreateRoom={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
