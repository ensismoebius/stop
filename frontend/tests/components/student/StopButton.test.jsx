import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StopButton from "../../../src/components/student/StopButton.jsx";

describe("StopButton", () => {
  it("shows filled/total progress when enabled", () => {
    render(<StopButton disabled={false} filled={7} total={10} onClick={vi.fn()} />);
    expect(screen.getByText("7 / 10 preenchidas")).toBeInTheDocument();
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("shows how many categories are missing when disabled with categories left", () => {
    render(<StopButton disabled filled={7} total={10} onClick={vi.fn()} />);
    expect(screen.getByText("faltam 3 de 10")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("shows 'indisponível' when disabled with nothing missing", () => {
    render(<StopButton disabled filled={10} total={10} onClick={vi.fn()} />);
    expect(screen.getByText("indisponível")).toBeInTheDocument();
  });

  it("clamps missing count to zero when filled exceeds total", () => {
    render(<StopButton disabled filled={12} total={10} onClick={vi.fn()} />);
    expect(screen.getByText("indisponível")).toBeInTheDocument();
  });

  it("calls onClick when clicked and enabled", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<StopButton disabled={false} filled={10} total={10} onClick={onClick} />);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
