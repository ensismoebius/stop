import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import JoinPage from "../../src/pages/JoinPage.jsx";
import { PlayerProvider, usePlayer } from "../../src/state/PlayerContext.jsx";
import api from "../../src/services/api.js";

vi.mock("../../src/services/api.js", () => ({
  default: {
    getRoom: vi.fn(),
    identify: vi.fn(),
    setAvatar: vi.fn(),
    join: vi.fn(),
  },
}));

// AvatarPicker belongs to components/student/, owned by a different agent
// in this test-writing effort — stub it so JoinPage tests only exercise
// JoinPage's own logic (which avatarUrl gets sent onwards).
vi.mock("../../src/components/student/AvatarPicker.jsx", () => ({
  default: ({ value, onChange }) => (
    <div>
      <span>avatar-picker:{value ?? "none"}</span>
      <button type="button" onClick={() => onChange("face:v1:02111002203202052")}>
        pick-avatar
      </button>
    </div>
  ),
}));

/** Marker route component that dumps the current player from context. */
function PlaySpy() {
  const { player } = usePlayer();
  return <div>play-screen:{player ? JSON.stringify(player) : "no-player"}</div>;
}

/** Renders JoinPage at /join/:code with a /play route spy. */
function renderPage(code = "STOP-1") {
  return render(
    <MemoryRouter initialEntries={[`/join/${code}`]}>
      <PlayerProvider>
        <Routes>
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="/play" element={<PlaySpy />} />
        </Routes>
      </PlayerProvider>
    </MemoryRouter>,
  );
}

describe("JoinPage", () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("shows the room code and game/class info once the room loads", async () => {
    api.getRoom.mockResolvedValue({ game: { name: "Jogo X" }, className: "9A" });
    renderPage("STOP-1");

    expect(screen.getByText("STOP-1")).toBeInTheDocument();
    expect(await screen.findByText("Jogo X · 9A")).toBeInTheDocument();
  });

  it("shows an error alert when the room fails to load", async () => {
    api.getRoom.mockRejectedValue(new Error("Sala nao encontrada"));
    renderPage("BAD");
    expect(await screen.findByRole("alert")).toHaveTextContent("Sala nao encontrada");
  });

  it("identifies a student by registration number and shows the confirm step", async () => {
    const user = userEvent.setup();
    api.getRoom.mockResolvedValue({ game: { name: "Jogo X" } });
    api.identify.mockResolvedValue({
      student: { name: "Ana Silva", registrationNumber: "123", avatarUrl: null },
    });

    renderPage();
    await user.type(screen.getByLabelText("Matrícula"), "123");
    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));

    expect(await screen.findByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("Matrícula: 123")).toBeInTheDocument();
    expect(api.identify).toHaveBeenCalledWith("STOP-1", "123");
  });

  it("shows an error alert when identification fails", async () => {
    const user = userEvent.setup();
    api.getRoom.mockResolvedValue({});
    api.identify.mockRejectedValue(new Error("Matricula nao encontrada"));

    renderPage();
    await user.type(screen.getByLabelText("Matrícula"), "999");
    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Matricula nao encontrada");
  });

  it("lets the student reject the identified candidate and go back to the form", async () => {
    const user = userEvent.setup();
    api.getRoom.mockResolvedValue({});
    api.identify.mockResolvedValue({
      student: { name: "Ana Silva", registrationNumber: "123", avatarUrl: null },
    });

    renderPage();
    await user.type(screen.getByLabelText("Matrícula"), "123");
    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));
    expect(await screen.findByText("Ana Silva")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "NÃO" }));

    expect(screen.getByLabelText("Matrícula")).toHaveValue("");
    expect(screen.queryByText("Ana Silva")).not.toBeInTheDocument();
  });

  it("goes through the avatar step, joins, and navigates to /play with the chosen avatar", async () => {
    const user = userEvent.setup();
    api.getRoom.mockResolvedValue({});
    api.identify.mockResolvedValue({
      student: { name: "Ana Silva", registrationNumber: "123", avatarUrl: null },
    });
    api.setAvatar.mockResolvedValue({});
    api.join.mockResolvedValue({
      token: "tok",
      student: { name: "Ana Silva", registrationNumber: "123" },
    });

    renderPage();
    await user.type(screen.getByLabelText("Matrícula"), "123");
    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));
    await user.click(await screen.findByRole("button", { name: "SIM, SOU EU" }));

    expect(await screen.findByText("avatar-picker:none")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "pick-avatar" }));
    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));

    await waitFor(() =>
      expect(api.setAvatar).toHaveBeenCalledWith("STOP-1", "123", "face:v1:02111002203202052"),
    );
    expect(api.join).toHaveBeenCalledWith("STOP-1", "123");
    expect(await screen.findByText(/play-screen:/)).toBeInTheDocument();
    expect(screen.getByText(/face:v1:/)).toBeInTheDocument();
  });

  it("skips the avatar step without calling setAvatar", async () => {
    const user = userEvent.setup();
    api.getRoom.mockResolvedValue({});
    api.identify.mockResolvedValue({
      student: { name: "Ana Silva", registrationNumber: "123", avatarUrl: null },
    });
    api.join.mockResolvedValue({
      token: "tok",
      student: { name: "Ana Silva", registrationNumber: "123" },
    });

    renderPage();
    await user.type(screen.getByLabelText("Matrícula"), "123");
    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));
    await user.click(await screen.findByRole("button", { name: "SIM, SOU EU" }));

    await user.click(await screen.findByRole("button", { name: "Pular" }));

    await waitFor(() => expect(api.join).toHaveBeenCalledWith("STOP-1", "123"));
    expect(api.setAvatar).not.toHaveBeenCalled();
    expect(await screen.findByText(/play-screen:/)).toBeInTheDocument();
  });

  it("shows an error alert when joining fails", async () => {
    const user = userEvent.setup();
    api.getRoom.mockResolvedValue({});
    api.identify.mockResolvedValue({
      student: { name: "Ana Silva", registrationNumber: "123", avatarUrl: null },
    });
    api.join.mockRejectedValue(new Error("Sala cheia"));

    renderPage();
    await user.type(screen.getByLabelText("Matrícula"), "123");
    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));
    await user.click(await screen.findByRole("button", { name: "SIM, SOU EU" }));
    await user.click(await screen.findByRole("button", { name: "Pular" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sala cheia");
  });

  it("does not call setAvatar again when the chosen avatar matches the candidate's current one", async () => {
    const user = userEvent.setup();
    api.getRoom.mockResolvedValue({});
    api.identify.mockResolvedValue({
      student: { name: "Ana Silva", registrationNumber: "123", avatarUrl: "face:v1:01111002203202052" },
    });
    api.join.mockResolvedValue({
      token: "tok",
      student: { name: "Ana Silva", registrationNumber: "123" },
    });

    renderPage();
    await user.type(screen.getByLabelText("Matrícula"), "123");
    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));
    await user.click(await screen.findByRole("button", { name: "SIM, SOU EU" }));
    expect(await screen.findByText("avatar-picker:face:v1:01111002203202052")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "CONTINUAR" }));

    await waitFor(() => expect(api.join).toHaveBeenCalled());
    expect(api.setAvatar).not.toHaveBeenCalled();
  });
});
