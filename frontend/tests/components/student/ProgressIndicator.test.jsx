import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ProgressIndicator from "../../../src/components/student/ProgressIndicator.jsx";

describe("ProgressIndicator", () => {
  it("renders the filled/total counts and percentage", () => {
    const { container } = render(<ProgressIndicator filled={3} total={10} />);
    expect(screen.getByText("3 / 10 preenchidas")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(container.querySelector(".progress__fill")).toHaveStyle({ width: "30%" });
  });

  it("avoids division by zero when total is 0", () => {
    render(<ProgressIndicator filled={0} total={0} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("sets progressbar aria attributes", () => {
    render(<ProgressIndicator filled={4} total={8} />);
    const bar = screen.getByRole("progressbar", { name: "Categorias preenchidas" });
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "8");
    expect(bar).toHaveAttribute("aria-valuenow", "4");
  });

  it("rounds the percentage", () => {
    render(<ProgressIndicator filled={1} total={3} />);
    expect(screen.getByText("33%")).toBeInTheDocument();
  });
});
