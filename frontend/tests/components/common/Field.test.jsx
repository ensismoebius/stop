import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Field from "../../../src/components/common/Field.jsx";

describe("Field", () => {
  it("renders a label associated with the input via htmlFor/id", () => {
    render(
      <Field id="name" label="Nome">
        <input id="name" />
      </Field>,
    );
    const input = screen.getByLabelText("Nome");
    expect(input).toBeInTheDocument();
  });

  it("renders a hint and wires aria-describedby onto a valid element child", () => {
    render(
      <Field id="name" label="Nome" hint="Seu nome completo">
        <input id="name" />
      </Field>,
    );
    const input = screen.getByLabelText("Nome");
    expect(input).toHaveAttribute("aria-describedby", "name-hint");
    expect(screen.getByText("Seu nome completo")).toHaveAttribute("id", "name-hint");
  });

  it("preserves and appends to an existing aria-describedby on the child", () => {
    render(
      <Field id="name" label="Nome" hint="Dica">
        <input id="name" aria-describedby="existing-desc" />
      </Field>,
    );
    expect(screen.getByLabelText("Nome")).toHaveAttribute(
      "aria-describedby",
      "existing-desc name-hint",
    );
  });

  it("renders no hint span when hint is not provided", () => {
    const { container } = render(
      <Field id="name" label="Nome">
        <input id="name" />
      </Field>,
    );
    expect(container.querySelector(".small.muted")).toBeNull();
  });

  it("renders non-element children (e.g. text) without cloning", () => {
    render(
      <Field id="name" label="Nome" hint="Dica">
        plain text child
      </Field>,
    );
    expect(screen.getByText("plain text child")).toBeInTheDocument();
    expect(screen.getByText("Dica")).toBeInTheDocument();
  });
});
