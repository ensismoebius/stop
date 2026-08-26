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
});
