import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayerProvider, usePlayer } from "../../src/state/PlayerContext.jsx";

const STORAGE_KEY = "stop:player";

function Consumer() {
  const { player, save, clear } = usePlayer();
  return (
    <div>
      <span data-testid="name">{player?.name ?? "none"}</span>
      <button onClick={() => save({ name: "Aluno 1", token: "ptok" })}>save</button>
      <button onClick={() => clear()}>clear</button>
    </div>
  );
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlayerProvider / usePlayer", () => {
  it("throws when usePlayer is used outside of PlayerProvider", () => {
    const Bare = () => {
      usePlayer();
      return null;
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow("usePlayer precisa estar dentro de PlayerProvider");
    spy.mockRestore();
  });

  it("starts with no player when nothing is stored", () => {
    render(
      <PlayerProvider>
        <Consumer />
      </PlayerProvider>,
    );
    expect(screen.getByTestId("name")).toHaveTextContent("none");
  });

  it("restores a stored player from sessionStorage", () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name: "Bia" }));
    render(
      <PlayerProvider>
        <Consumer />
      </PlayerProvider>,
    );
    expect(screen.getByTestId("name")).toHaveTextContent("Bia");
  });

  it("ignores invalid JSON in sessionStorage and starts with no player", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{not json");
    render(
      <PlayerProvider>
        <Consumer />
      </PlayerProvider>,
    );
    expect(screen.getByTestId("name")).toHaveTextContent("none");
  });

  it("save() updates state and persists to sessionStorage", async () => {
    const user = userEvent.setup();
    render(
      <PlayerProvider>
        <Consumer />
      </PlayerProvider>,
    );
    await user.click(screen.getByText("save"));
    expect(screen.getByTestId("name")).toHaveTextContent("Aluno 1");
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)).name).toBe("Aluno 1");
  });

  it("clear() resets state and removes the sessionStorage entry", async () => {
    const user = userEvent.setup();
    render(
      <PlayerProvider>
        <Consumer />
      </PlayerProvider>,
    );
    await user.click(screen.getByText("save"));
    await user.click(screen.getByText("clear"));
    expect(screen.getByTestId("name")).toHaveTextContent("none");
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("survives sessionStorage writes throwing (storage unavailable)", async () => {
    const spy = vi
      .spyOn(window.sessionStorage.__proto__, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    const user = userEvent.setup();
    render(
      <PlayerProvider>
        <Consumer />
      </PlayerProvider>,
    );
    await user.click(screen.getByText("save"));
    expect(screen.getByTestId("name")).toHaveTextContent("Aluno 1");
    spy.mockRestore();
  });
});
