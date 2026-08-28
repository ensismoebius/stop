import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import HomePage from "../../src/pages/HomePage.jsx";
import { AuthProvider } from "../../src/state/AuthContext.jsx";
import api from "../../src/services/api.js";

vi.mock("../../src/services/api.js", () => ({
  default: {
    me: vi.fn(),
    login: vi.fn(),
  },
}));

/** Marker route component that renders the current :code param. */
function JoinScreenStub() {
  const { code } = useParams();
  return <div>join-screen:{code}</div>;
}

/** Renders HomePage inside a router with the join route stubbed. */
function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/join/:code" element={<JoinScreenStub />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("HomePage", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("hides teacher/screen shortcuts when unauthenticated", async () => {
    renderHome();
    expect(screen.queryByText("Painel do professor")).not.toBeInTheDocument();
    expect(screen.queryByText("Tela pública")).not.toBeInTheDocument();
    expect(screen.getByText("Meu histórico")).toBeInTheDocument();
  });

  it("shows teacher/screen shortcuts when an admin session is stored and valid", async () => {
    window.localStorage.setItem(
      "stop:admin",
      JSON.stringify({ token: "tok-1", teacher: { id: 1, name: "Prof" } }),
    );
    api.me.mockResolvedValue({ id: 1, name: "Prof" });

    renderHome();

    await waitFor(() => expect(screen.getByText("Painel do professor")).toBeInTheDocument());
    expect(screen.getByText("Tela pública")).toBeInTheDocument();
  });

  it("navigates to /join/:code (uppercased, trimmed) on submit", async () => {
    const user = userEvent.setup();
    renderHome();

    const input = screen.getByPlaceholderText("STOP-7F42");
    await user.type(input, "  ab12  ");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByText("join-screen:AB12")).toBeInTheDocument());
  });

  it("does not navigate when the submitted code is blank", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });
});
