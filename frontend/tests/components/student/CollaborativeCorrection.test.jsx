import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CollaborativeCorrection from "../../../src/components/student/CollaborativeCorrection.jsx";

function review(overrides = {}) {
  return { reviewId: "r1", categoryName: "Fruta", value: "Abacaxi", ...overrides };
}

describe("CollaborativeCorrection", () => {
  it("shows a message when no reviews were assigned", () => {
    render(
      <CollaborativeCorrection
        reviews={[]}
        completedIds={new Set()}
        onDecide={vi.fn()}
        deciding={false}
        letter="A"
      />,
    );
    expect(screen.getByText("Correção colaborativa")).toBeInTheDocument();
    expect(
      screen.getByText("Nenhuma resposta foi atribuída a você nesta rodada."),
    ).toBeInTheDocument();
  });

  it("shows a 'done' notice once every review is completed", () => {
    render(
      <CollaborativeCorrection
        reviews={[review()]}
        completedIds={new Set(["r1"])}
        onDecide={vi.fn()}
        deciding={false}
        letter="A"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Você terminou!");
  });

  it("renders the current pending review with the letter hint and progress", () => {
    render(
      <CollaborativeCorrection
        reviews={[review(), review({ reviewId: "r2", categoryName: "Cor", value: "Azul" })]}
        completedIds={new Set()}
        onDecide={vi.fn()}
        deciding={false}
        letter="A"
      />,
    );
    expect(screen.getByText("Corrija um colega — Fruta")).toBeInTheDocument();
    expect(screen.getByText("Letra A")).toBeInTheDocument();
    expect(screen.getByText("Abacaxi")).toBeInTheDocument();
    expect(screen.getByText("Progresso: 0 / 2")).toBeInTheDocument();
  });

  it("omits the letter hint when letter is falsy", () => {
    render(
      <CollaborativeCorrection
        reviews={[review()]}
        completedIds={new Set()}
        onDecide={vi.fn()}
        deciding={false}
        letter={null}
      />,
    );
    expect(screen.queryByText(/^Letra /)).not.toBeInTheDocument();
  });

  it("renders an em dash placeholder for a blank answer", () => {
    render(
      <CollaborativeCorrection
        reviews={[review({ value: "" })]}
        completedIds={new Set()}
        onDecide={vi.fn()}
        deciding={false}
        letter="A"
      />,
    );
    expect(screen.getByText("— em branco —")).toBeInTheDocument();
  });

  it("calls onDecide with VALID and advances to the next pending review", async () => {
    const onDecide = vi.fn();
    const user = userEvent.setup();
    render(
      <CollaborativeCorrection
        reviews={[review(), review({ reviewId: "r2", categoryName: "Cor", value: "Azul" })]}
        completedIds={new Set()}
        onDecide={onDecide}
        deciding={false}
        letter="A"
      />,
    );
    await user.click(screen.getByText("✓ Válida"));
    expect(onDecide).toHaveBeenCalledWith("r1", "VALID");
    expect(screen.getByText("Corrija um colega — Cor")).toBeInTheDocument();
  });

  it("calls onDecide with INVALID", async () => {
    const onDecide = vi.fn();
    const user = userEvent.setup();
    render(
      <CollaborativeCorrection
        reviews={[review()]}
        completedIds={new Set()}
        onDecide={onDecide}
        deciding={false}
        letter="A"
      />,
    );
    await user.click(screen.getByText("✗ Inválida"));
    expect(onDecide).toHaveBeenCalledWith("r1", "INVALID");
  });

  it("disables the decision buttons while deciding", () => {
    render(
      <CollaborativeCorrection
        reviews={[review()]}
        completedIds={new Set()}
        onDecide={vi.fn()}
        deciding
        letter="A"
      />,
    );
    expect(screen.getByText("✓ Válida")).toBeDisabled();
    expect(screen.getByText("✗ Inválida")).toBeDisabled();
  });

  it("filters out already-completed reviews from the pending queue", () => {
    render(
      <CollaborativeCorrection
        reviews={[review(), review({ reviewId: "r2", categoryName: "Cor", value: "Azul" })]}
        completedIds={new Set(["r1"])}
        onDecide={vi.fn()}
        deciding={false}
        letter="A"
      />,
    );
    expect(screen.getByText("Corrija um colega — Cor")).toBeInTheDocument();
    expect(screen.getByText("Progresso: 1 / 2")).toBeInTheDocument();
  });

  it("resets the local index when the reviews array length changes", () => {
    const { rerender } = render(
      <CollaborativeCorrection
        reviews={[review(), review({ reviewId: "r2", categoryName: "Cor", value: "Azul" })]}
        completedIds={new Set()}
        onDecide={vi.fn()}
        deciding={false}
        letter="A"
      />,
    );
    rerender(
      <CollaborativeCorrection
        reviews={[review({ reviewId: "r3", categoryName: "Animal", value: "Ariranha" })]}
        completedIds={new Set()}
        onDecide={vi.fn()}
        deciding={false}
        letter="A"
      />,
    );
    expect(screen.getByText("Corrija um colega — Animal")).toBeInTheDocument();
  });
});
