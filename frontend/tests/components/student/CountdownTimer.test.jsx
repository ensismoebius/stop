import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import CountdownTimer from "../../../src/components/student/CountdownTimer.jsx";

describe("CountdownTimer", () => {
  it("renders the placeholder clock when seconds is null", () => {
    render(<CountdownTimer seconds={null} running={false} />);
    expect(screen.getByText("--:--")).toBeInTheDocument();
  });

  it("renders formatted time", () => {
    render(<CountdownTimer seconds={75} running={false} />);
    expect(screen.getByText("01:15")).toBeInTheDocument();
  });

  it("is not urgent when not running, even at low seconds", () => {
    const { container } = render(<CountdownTimer seconds={5} running={false} />);
    expect(container.querySelector(".timer")).not.toHaveClass("timer--urgent");
  });

  it("is not urgent when running with more than 10 seconds left", () => {
    const { container } = render(<CountdownTimer seconds={11} running />);
    expect(container.querySelector(".timer")).not.toHaveClass("timer--urgent");
  });

  it("is urgent when running with 10 or fewer seconds left", () => {
    const { container } = render(<CountdownTimer seconds={10} running />);
    expect(container.querySelector(".timer")).toHaveClass("timer--urgent");
  });

  it("announces the remaining seconds via the live region only when urgent", () => {
    const { container, rerender } = render(<CountdownTimer seconds={10} running />);
    expect(container.querySelector(".sr-only")).toHaveTextContent("10 segundos restantes");

    rerender(<CountdownTimer seconds={30} running />);
    expect(container.querySelector(".sr-only")).toHaveTextContent("");
  });

  it("is not urgent when seconds is null even while running", () => {
    const { container } = render(<CountdownTimer seconds={null} running />);
    expect(container.querySelector(".timer")).not.toHaveClass("timer--urgent");
  });
});
