import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AnswerEditor from "../../../src/components/student/AnswerEditor.jsx";

const category = { id: "c1", name: "Fruta" };

describe("AnswerEditor", () => {
  it("renders nothing when category is falsy", () => {
    const { container } = render(
      <AnswerEditor
        category={null}
        value=""
        letter="A"
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the category name and placeholder with the letter", () => {
    render(
      <AnswerEditor
        category={category}
        value=""
        letter="A"
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Fruta")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Começa com A...")).toBeInTheDocument();
  });

  it("renders a generic placeholder when there is no letter", () => {
    render(
      <AnswerEditor
        category={category}
        value=""
        letter={null}
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("Sua resposta")).toBeInTheDocument();
  });

  it("focuses the input on mount when not disabled", () => {
    render(
      <AnswerEditor
        category={category}
        value=""
        letter="A"
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("does not focus the input when disabled", () => {
    render(
      <AnswerEditor
        category={category}
        value=""
        letter="A"
        disabled
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).not.toHaveFocus();
  });

  it("calls onChange with the category id and new value while typing", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AnswerEditor
        category={category}
        value=""
        letter="A"
        disabled={false}
        onChange={onChange}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    await user.type(screen.getByRole("textbox"), "Abacaxi");
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0][0]).toBe("c1");
  });

  it("calls onCommit with the category id on blur", async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <AnswerEditor
          category={category}
          value="Abacaxi"
          letter="A"
          disabled={false}
          onChange={vi.fn()}
          onCommit={onCommit}
          onClose={vi.fn()}
        />
        <button>outside</button>
      </>,
    );
    await user.click(screen.getByRole("textbox"));
    await user.click(screen.getByText("outside"));
    expect(onCommit).toHaveBeenCalledWith("c1");
  });

  it("commits and closes on Enter", async () => {
    const onCommit = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <AnswerEditor
        category={category}
        value="Abacaxi"
        letter="A"
        disabled={false}
        onChange={vi.fn()}
        onCommit={onCommit}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole("textbox"));
    await user.keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledWith("c1");
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the Voltar button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <AnswerEditor
        category={category}
        value=""
        letter="A"
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByText("Voltar"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows the default hint when the answer starts with the letter", () => {
    render(
      <AnswerEditor
        category={category}
        value="Abacaxi"
        letter="A"
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("A resposta é salva automaticamente.")).toBeInTheDocument();
  });

  it("shows the default hint (not a warning) when the answer is empty", () => {
    render(
      <AnswerEditor
        category={category}
        value=""
        letter="A"
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("A resposta é salva automaticamente.")).toBeInTheDocument();
  });

  it("shows the default hint when there is no letter set at all", () => {
    render(
      <AnswerEditor
        category={category}
        value="Qualquer coisa"
        letter={null}
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("A resposta é salva automaticamente.")).toBeInTheDocument();
  });

  it("shows a warning hint when the answer does not start with the letter", () => {
    render(
      <AnswerEditor
        category={category}
        value="Banana"
        letter="A"
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Atenção: a resposta não começa com a letra A."),
    ).toBeInTheDocument();
  });

  it("ignores diacritics and case when checking the starting letter", () => {
    render(
      <AnswerEditor
        category={category}
        value="água"
        letter="A"
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("A resposta é salva automaticamente.")).toBeInTheDocument();
  });

  it("disables the input when disabled prop is true", () => {
    render(
      <AnswerEditor
        category={category}
        value=""
        letter="A"
        disabled
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("treats a null/undefined value the same as an empty string", () => {
    render(
      <AnswerEditor
        category={category}
        value={null}
        letter="A"
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByText("A resposta é salva automaticamente.")).toBeInTheDocument();
  });

  it("refocuses when the category changes", () => {
    const { rerender } = render(
      <AnswerEditor
        category={category}
        value=""
        letter="A"
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    screen.getByRole("textbox").blur();
    rerender(
      <AnswerEditor
        category={{ id: "c2", name: "Cor" }}
        value=""
        letter="A"
        disabled={false}
        onChange={vi.fn()}
        onCommit={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveFocus();
  });
});
