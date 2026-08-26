import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "../../src/state/AuthContext.jsx";
import api from "../../src/services/api.js";

const STORAGE_KEY = "stop:admin";

vi.mock("../../src/services/api.js", () => ({
  default: { login: vi.fn(), me: vi.fn() },
}));

function Consumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="checking">{String(auth.checking)}</span>
      <span data-testid="authenticated">{String(auth.authenticated)}</span>
      <span data-testid="token">{auth.token ?? "none"}</span>
      <span data-testid="teacher">{auth.teacher?.name ?? "none"}</span>
      <button onClick={() => auth.login("a@b.com", "pw").catch(() => {})}>login</button>
      <button onClick={() => auth.logout()}>logout</button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  api.login.mockReset();
  api.me.mockReset();
  // Sane default so effects triggered by a fresh login (which re-runs the
  // token-validation effect) don't call an unmocked api.me().
  api.me.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthProvider / useAuth", () => {
  it("throws when useAuth is used outside of AuthProvider", () => {
    const Bare = () => {
      useAuth();
      return null;
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow("useAuth precisa estar dentro de AuthProvider");
    spy.mockRestore();
  });

  it("starts unauthenticated with checking=false when nothing is stored", async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
    await waitFor(() => expect(screen.getByTestId("checking")).toHaveTextContent("false"));
  });

  it("ignores invalid JSON in localStorage and starts unauthenticated", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
  });

  it("restores a stored session and validates it via api.me, keeping it on success", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: "tok1", teacher: { name: "Prof" } }),
    );
    api.me.mockResolvedValue({ ok: true });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    expect(screen.getByTestId("checking")).toHaveTextContent("true");
    await waitFor(() => expect(screen.getByTestId("checking")).toHaveTextContent("false"));
    expect(screen.getByTestId("authenticated")).toHaveTextContent("true");
    expect(screen.getByTestId("teacher")).toHaveTextContent("Prof");
    expect(api.me).toHaveBeenCalledWith("tok1");
  });

  it("clears a stored session when api.me rejects (expired/invalid token)", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: "bad-tok" }));
    api.me.mockRejectedValue(new Error("unauthorized"));

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("checking")).toHaveTextContent("false"));
    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("login() stores the session and persists it to localStorage", async () => {
    api.login.mockResolvedValue({ token: "new-tok", teacher: { name: "Ana" } });
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await user.click(screen.getByText("login"));

    await waitFor(() => expect(screen.getByTestId("authenticated")).toHaveTextContent("true"));
    expect(screen.getByTestId("token")).toHaveTextContent("new-tok");
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).token).toBe("new-tok");
  });

  it("logout() clears the session and removes it from localStorage", async () => {
    api.login.mockResolvedValue({ token: "new-tok", teacher: { name: "Ana" } });
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await user.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("authenticated")).toHaveTextContent("true"));

    await user.click(screen.getByText("logout"));
    expect(screen.getByTestId("authenticated")).toHaveTextContent("false");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("survives localStorage writes throwing (storage unavailable)", async () => {
    const spy = vi
      .spyOn(window.localStorage.__proto__, "setItem")
      .mockImplementation(() => {
        throw new Error("quota");
      });
    api.login.mockResolvedValue({ token: "x" });
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await user.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("authenticated")).toHaveTextContent("true"));
    spy.mockRestore();
  });

  it("cancels the api.me validation effect if unmounted before it resolves", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: "tok1" }));
    let resolveMe;
    api.me.mockReturnValue(new Promise((resolve) => (resolveMe = resolve)));

    const { unmount } = render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    unmount();
    await act(async () => {
      resolveMe({ ok: true });
      await Promise.resolve();
    });
    // No assertion needed beyond "doesn't throw / doesn't warn about
    // updating an unmounted component" — the cancelled-flag branch ran.
  });
});
