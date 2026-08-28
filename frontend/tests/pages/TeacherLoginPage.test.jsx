import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TeacherLoginPage from "../../src/pages/TeacherLoginPage.jsx";
import { AuthProvider } from "../../src/state/AuthContext.jsx";
import { ApiError } from "../../src/services/api.js";
import api from "../../src/services/api.js";

vi.mock("../../src/services/api.js", () => {
  /** Minimal ApiError stand-in for asserting login error handling. */
  class ApiError extends Error {
    /** Sets the error name and copies extra fields onto the instance. */
    constructor(message, opts) {
      super(message);
      this.name = "ApiError";
      Object.assign(this, opts);
    }
  }
  return {
    ApiError,
    default: {
      me: vi.fn().mockResolvedValue(null),
      login: vi.fn(),
    },
  };
});

/** Renders the login page inside AuthProvider. */
function renderPage() {
  return render(
    <AuthProvider>
      <TeacherLoginPage />
    </AuthProvider>,
  );
}

describe("TeacherLoginPage", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders the login form with no error initially", () => {
    renderPage();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("logs in successfully and calls api.login with trimmed email", async () => {
    const user = userEvent.setup();
    api.login.mockResolvedValue({ token: "tok", teacher: { id: 1 } });

    renderPage();
    await user.type(screen.getByLabelText("E-mail"), "  prof@escola.com ");
    await user.type(screen.getByLabelText("Senha"), "segredo");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith("prof@escola.com", "segredo"));
  });

  it("shows the busy label while submitting", async () => {
    const user = userEvent.setup();
    let resolveLogin;
    api.login.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );

    renderPage();
    await user.type(screen.getByLabelText("E-mail"), "prof@escola.com");
    await user.type(screen.getByLabelText("Senha"), "segredo");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(screen.getByRole("button", { name: "Entrando..." })).toBeDisabled();
    resolveLogin({ token: "tok", teacher: { id: 1 } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Entrar" })).not.toBeDisabled());
  });

  it("shows an error alert when login fails", async () => {
    const user = userEvent.setup();
    api.login.mockRejectedValue(new ApiError("Credenciais invalidas"));

    renderPage();
    await user.type(screen.getByLabelText("E-mail"), "prof@escola.com");
    await user.type(screen.getByLabelText("Senha"), "errada");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Credenciais invalidas");
    expect(screen.getByRole("button", { name: "Entrar" })).not.toBeDisabled();
  });
});
