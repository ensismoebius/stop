import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";

// main.jsx renders at import time (no exported function to call), so this test
// mocks ReactDOM.createRoot and re-imports the module fresh to observe how it
// wires React.StrictMode + BrowserRouter + App around the #root element.
const renderMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock }));
vi.mock("react-dom/client", () => ({
  default: { createRoot: (...args) => createRootMock(...args) },
}));
vi.mock("../src/App.jsx", () => ({ default: () => null }));

describe("main.jsx entry point", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.resetModules();
    renderMock.mockClear();
    createRootMock.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("mounts the app onto the #root element inside StrictMode + BrowserRouter", async () => {
    await import("../src/main.jsx");

    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(createRootMock).toHaveBeenCalledWith(document.getElementById("root"));
    expect(renderMock).toHaveBeenCalledTimes(1);

    const tree = renderMock.mock.calls[0][0];
    expect(tree.type).toBe(React.StrictMode);
    const browserRouter = tree.props.children;
    expect(browserRouter.type.name).toBe("BrowserRouter");
  });
});
