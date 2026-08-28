import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../src/App.jsx";

// App.jsx's own job is just wiring routes/providers/useAutoFullscreen together —
// the pages themselves are covered by their own dedicated test files (and, for
// the ones outside this agent's scope, by the other agent's). Stub every page
// as a marker so this file only exercises App's routing/composition logic.
vi.mock("../src/pages/HomePage.jsx", () => ({ default: () => <div data-testid="home-page" /> }));
vi.mock("../src/pages/JoinPage.jsx", () => ({ default: () => <div data-testid="join-page" /> }));
vi.mock("../src/pages/StudentGamePage.jsx", () => ({ default: () => <div data-testid="student-game-page" /> }));
vi.mock("../src/pages/StudentHistoryPage.jsx", () => ({
  default: () => <div data-testid="student-history-page" />,
}));
vi.mock("../src/pages/TeacherDashboardPage.jsx", () => ({
  default: () => <div data-testid="teacher-dashboard-page" />,
}));
vi.mock("../src/pages/PublicScreenPage.jsx", () => ({ default: () => <div data-testid="public-screen-page" /> }));

const useAutoFullscreenMock = vi.fn();
vi.mock("../src/hooks/useAutoFullscreen.js", () => ({
  default: (...args) => useAutoFullscreenMock(...args),
}));

/** Renders <App /> at the given route so tests assert routing/composition. */
function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App", () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("routes / to HomePage", () => {
    renderAt("/");
    expect(screen.getByTestId("home-page")).toBeInTheDocument();
  });

  it("routes /join/:code to JoinPage", () => {
    renderAt("/join/ABC123");
    expect(screen.getByTestId("join-page")).toBeInTheDocument();
  });

  it("routes /play to StudentGamePage", () => {
    renderAt("/play");
    expect(screen.getByTestId("student-game-page")).toBeInTheDocument();
  });

  it("routes /historico to StudentHistoryPage", () => {
    renderAt("/historico");
    expect(screen.getByTestId("student-history-page")).toBeInTheDocument();
  });

  it("routes /historico/:registrationNumber to StudentHistoryPage", () => {
    renderAt("/historico/42");
    expect(screen.getByTestId("student-history-page")).toBeInTheDocument();
  });

  it("routes /teacher to TeacherDashboardPage", () => {
    renderAt("/teacher");
    expect(screen.getByTestId("teacher-dashboard-page")).toBeInTheDocument();
  });

  it("routes /screen to PublicScreenPage", () => {
    renderAt("/screen");
    expect(screen.getByTestId("public-screen-page")).toBeInTheDocument();
  });

  it("routes /screen/:code to PublicScreenPage", () => {
    renderAt("/screen/ABC123");
    expect(screen.getByTestId("public-screen-page")).toBeInTheDocument();
  });

  it("redirects unknown paths to /", () => {
    renderAt("/does/not/exist");
    expect(screen.getByTestId("home-page")).toBeInTheDocument();
  });

  it("enables auto-fullscreen outside the teacher dashboard", () => {
    renderAt("/");
    expect(useAutoFullscreenMock).toHaveBeenCalledWith({ enabled: true });
  });

  it("disables auto-fullscreen on the teacher dashboard", () => {
    renderAt("/teacher");
    expect(useAutoFullscreenMock).toHaveBeenCalledWith({ enabled: false });
  });
});
