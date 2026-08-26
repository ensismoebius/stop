import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudentHistoryPage from "../../src/pages/StudentHistoryPage.jsx";
import api from "../../src/services/api.js";

vi.mock("../../src/services/api.js", () => ({
  default: {
    getStudentHistory: vi.fn(),
  },
}));

function renderPage(initialEntry = "/historico") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/historico" element={<StudentHistoryPage />} />
        <Route path="/historico/:registrationNumber" element={<StudentHistoryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StudentHistoryPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the search form with no results when there is no registration in the URL", () => {
    renderPage();
    expect(screen.getByLabelText("Matrícula")).toBeInTheDocument();
    expect(api.getStudentHistory).not.toHaveBeenCalled();
  });

  it("loads history automatically when a registration number is in the URL", async () => {
    api.getStudentHistory.mockResolvedValue({
      student: { name: "Ana", registrationNumber: "123" },
      results: [],
    });

    renderPage("/historico/123");

    await waitFor(() => expect(api.getStudentHistory).toHaveBeenCalledWith("123"));
    expect(await screen.findByText("Nenhuma partida finalizada ainda.")).toBeInTheDocument();
  });

  it("renders a results table with medal labels when there are finished games", async () => {
    api.getStudentHistory.mockResolvedValue({
      student: { name: "Ana", registrationNumber: "123" },
      results: [
        {
          id: "r1",
          gameName: "Jogo 1",
          discipline: "Geografia",
          className: "9A",
          finishedAt: "2026-01-05T12:00:00Z",
          position: 1,
          score: 42,
          medal: "GOLD",
        },
        {
          id: "r2",
          gameName: "Jogo 2",
          discipline: null,
          className: null,
          finishedAt: null,
          position: 5,
          score: 3,
          medal: null,
        },
      ],
    });

    renderPage("/historico/123");

    expect(await screen.findByText("Jogo 1")).toBeInTheDocument();
    expect(screen.getByText("🥇 Ouro")).toBeInTheDocument();
    expect(screen.getByText("Jogo 2")).toBeInTheDocument();
    // Missing discipline/className/finishedAt/medal render as an em dash.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("shows an error alert when the lookup fails", async () => {
    api.getStudentHistory.mockRejectedValue(new Error("Aluno nao encontrado"));

    renderPage("/historico/999");

    expect(await screen.findByRole("alert")).toHaveTextContent("Aluno nao encontrado");
  });

  it("navigates to /historico/:registrationNumber on manual search submit", async () => {
    const user = userEvent.setup();
    api.getStudentHistory.mockResolvedValue({
      student: { name: "Bob", registrationNumber: "456" },
      results: [],
    });

    renderPage("/historico");
    await user.type(screen.getByLabelText("Matrícula"), "456");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => expect(api.getStudentHistory).toHaveBeenCalledWith("456"));
  });

  it("does not navigate when the search input is blank", async () => {
    const user = userEvent.setup();
    renderPage("/historico");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    expect(api.getStudentHistory).not.toHaveBeenCalled();
  });
});
