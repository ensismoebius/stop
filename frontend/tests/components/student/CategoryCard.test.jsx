import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategoryCard from "../../../src/components/student/CategoryCard.jsx";

const category = { id: "c1", name: "Fruta" };

function renderCard(props = {}) {
  return render(
    <ul>
      <CategoryCard category={category} value="" current={false} disabled={false} onSelect={vi.fn()} {...props} />
    </ul>,
  );
}

describe("CategoryCard", () => {
  it("renders as empty when there is no value", () => {
    renderCard({ value: "" });
    const button = screen.getByRole("button");
    expect(button).toHaveClass("category--empty");
    expect(button).not.toHaveClass("category--filled");
    expect(screen.getByText("toque para responder")).toBeInTheDocument();
    expect(screen.getByText("○")).toBeInTheDocument();
  });

  it("treats a whitespace-only value as empty", () => {
    renderCard({ value: "   " });
    expect(screen.getByRole("button")).toHaveClass("category--empty");
  });

  it("renders as filled when there is a value", () => {
    renderCard({ value: "Abacaxi" });
    const button = screen.getByRole("button");
    expect(button).toHaveClass("category--filled");
    expect(screen.getByText("Abacaxi")).toBeInTheDocument();
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("marks the current category with aria-current and a modifier class", () => {
    renderCard({ current: true });
    const button = screen.getByRole("button");
    expect(button).toHaveClass("category--current");
    expect(button).toHaveAttribute("aria-current", "true");
  });

  it("does not set aria-current when not the current category", () => {
    renderCard({ current: false });
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-current");
  });

  it("disables the button when disabled", () => {
    renderCard({ disabled: true });
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("calls onSelect with the category id when clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderCard({ onSelect });
    await user.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("c1");
  });

  it("sets an accessible label reflecting filled state", () => {
    renderCard({ value: "Abacaxi" });
    expect(screen.getByRole("button")).toHaveAccessibleName("Fruta: Abacaxi");
  });

  it("sets an accessible label for the empty state", () => {
    renderCard({ value: "" });
    expect(screen.getByRole("button")).toHaveAccessibleName("Fruta: sem resposta");
  });
});
