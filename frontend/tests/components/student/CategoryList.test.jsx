import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CategoryList from "../../../src/components/student/CategoryList.jsx";

const categories = [
  { id: "c1", name: "Fruta" },
  { id: "c2", name: "Cor" },
];

describe("CategoryList", () => {
  it("renders one CategoryCard per category", () => {
    render(
      <CategoryList
        categories={categories}
        answers={{ c1: "Abacaxi" }}
        currentId={null}
        disabled={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByText("Fruta")).toBeInTheDocument();
    expect(screen.getByText("Cor")).toBeInTheDocument();
  });

  it("falls back to an empty string for categories missing an answer", () => {
    render(
      <CategoryList categories={categories} answers={{}} currentId={null} disabled={false} onSelect={vi.fn()} />,
    );
    expect(screen.getAllByText("toque para responder")).toHaveLength(2);
  });

  it("marks the category matching currentId as current", () => {
    render(
      <CategoryList
        categories={categories}
        answers={{}}
        currentId="c2"
        disabled={false}
        onSelect={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).not.toHaveClass("category--current");
    expect(buttons[1]).toHaveClass("category--current");
  });

  it("propagates onSelect and disabled to each card", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <CategoryList
        categories={categories}
        answers={{}}
        currentId={null}
        disabled
        onSelect={onSelect}
      />,
    );
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    // Clicking a disabled button should not fire the handler.
    await user.click(screen.getAllByRole("button")[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders an empty list when there are no categories", () => {
    const { container } = render(
      <CategoryList categories={[]} answers={{}} currentId={null} disabled={false} onSelect={vi.fn()} />,
    );
    expect(container.querySelector("ul.categories")).toBeEmptyDOMElement();
  });
});
