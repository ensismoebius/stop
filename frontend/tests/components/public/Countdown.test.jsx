import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Countdown from "../../../src/components/public/Countdown.jsx";

describe("Countdown", () => {
  it("renders the placeholder clock when seconds is null", () => {
    render(<Countdown seconds={null} running={false} />);
    expect(screen.getByText("--:--")).toBeInTheDocument();
  });

  it("renders formatted time", () => {
    render(<Countdown seconds={65} running={false} />);
    expect(screen.getByText("01:05")).toBeInTheDocument();
  });

  it("is urgent when running with 10 or fewer seconds left", () => {
    const { container } = render(<Countdown seconds={10} running />);
    expect(container.querySelector(".screen__clock")).toHaveClass("screen__clock--urgent");
  });

  it("is not urgent when not running", () => {
    const { container } = render(<Countdown seconds={5} running={false} />);
    expect(container.querySelector(".screen__clock")).not.toHaveClass("screen__clock--urgent");
  });

  it("is not urgent when running with more than 10 seconds left", () => {
    const { container } = render(<Countdown seconds={11} running />);
    expect(container.querySelector(".screen__clock")).not.toHaveClass("screen__clock--urgent");
  });
});
