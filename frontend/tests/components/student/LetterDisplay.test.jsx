import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LetterDisplay from "../../../src/components/student/LetterDisplay.jsx";

describe("LetterDisplay", () => {
  it("shows a dash when there is no letter", () => {
    const { container } = render(<LetterDisplay letter={null} status="CREATED" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(container.querySelector(".letter__value")).toHaveClass("letter__value--waiting");
  });

  it("shows a dash when status is CREATED, even with a letter", () => {
    const { container } = render(<LetterDisplay letter="A" status="CREATED" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(container.querySelector(".letter__value")).toHaveClass("letter__value--waiting");
  });

  it("reveals the letter once status is not CREATED", () => {
    const { container } = render(<LetterDisplay letter="A" status="PLAYING" />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(container.querySelector(".letter__value")).not.toHaveClass("letter__value--waiting");
  });

  it("states the STARTS_WITH rule by default", () => {
    render(<LetterDisplay letter="A" status="PLAYING" />);
    expect(screen.getByText("Começa com")).toBeInTheDocument();
  });

  it("states the CONTAINS rule when the round uses it", () => {
    render(<LetterDisplay letter="A" status="PLAYING" letterRule="CONTAINS" />);
    expect(screen.getByText("Contém")).toBeInTheDocument();
    expect(screen.queryByText("Começa com")).not.toBeInTheDocument();
  });

  it("states the rule even before the letter is revealed", () => {
    // A regra vale desde a criacao da rodada; o aluno pode ja se preparar.
    render(<LetterDisplay letter={null} status="CREATED" letterRule="CONTAINS" />);
    expect(screen.getByText("Contém")).toBeInTheDocument();
  });
});
