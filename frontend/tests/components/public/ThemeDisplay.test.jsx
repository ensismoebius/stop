import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ThemeDisplay from "../../../src/components/public/ThemeDisplay.jsx";

describe("ThemeDisplay", () => {
  it("renders nothing when there is no theme", () => {
    const { container } = render(<ThemeDisplay theme={null} roundNumber={1} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the theme with a round number prefix", () => {
    render(<ThemeDisplay theme="Animais" roundNumber={3} />);
    expect(screen.getByText("Rodada 3 — Animais")).toBeInTheDocument();
  });

  it("renders the theme alone when there is no round number", () => {
    render(<ThemeDisplay theme="Animais" roundNumber={null} />);
    expect(screen.getByText("Animais")).toBeInTheDocument();
  });
});
