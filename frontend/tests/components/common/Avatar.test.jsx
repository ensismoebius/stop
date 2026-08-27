import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Avatar from "../../../src/components/common/Avatar.jsx";
import FaceSvg from "../../../src/components/common/FaceSvg.jsx";
import { DEFAULT_FACE, encodeFace, randomFace } from "../../../src/lib/face.js";
import { FACE_COUNTS } from "../../../src/data/faceParts.js";

describe("Avatar", () => {
  it("desenha o rosto montado quando o valor é uma receita", () => {
    const { container } = render(<Avatar value={encodeFace(DEFAULT_FACE)} name="Ana" />);
    expect(container.querySelector('[data-avatar="face"] svg')).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("mostra a imagem quando o valor é uma foto", () => {
    const { container } = render(<Avatar value="data:image/jpeg;base64,abc" name="Ana" />);
    expect(container.querySelector('img[data-avatar="image"]')).toHaveAttribute(
      "src",
      "data:image/jpeg;base64,abc",
    );
  });

  it("sem avatar, cai na inicial do nome", () => {
    render(<Avatar value={null} name="Bruno" />);
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("é decorativo por padrão e vira conteúdo quando recebe alt", () => {
    const { container, rerender } = render(<Avatar value="data:image/jpeg;base64,abc" name="Ana" />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");

    rerender(<Avatar value="data:image/jpeg;base64,abc" name="Ana" alt="Seu avatar" />);
    expect(screen.getByRole("img", { name: "Seu avatar" })).toBeInTheDocument();
  });

  it("o rosto montado também só é anunciado quando tem alt", () => {
    const code = encodeFace(DEFAULT_FACE);
    const { container, rerender } = render(<Avatar value={code} name="Ana" />);
    expect(container.querySelector('[data-avatar="face"] > span')).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    rerender(<Avatar value={code} name="Ana" alt="Seu avatar" />);
    expect(screen.getByRole("img", { name: "Seu avatar" })).toBeInTheDocument();
  });
});

describe("FaceSvg", () => {
  it("desenha qualquer receita sem quebrar", () => {
    for (let i = 0; i < 300; i += 1) {
      const { container, unmount } = render(<FaceSvg spec={randomFace()} />);
      expect(container.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });

  it("desenha todas as peças de todas as partes", () => {
    for (const [part, count] of Object.entries(FACE_COUNTS)) {
      for (let i = 0; i < count; i += 1) {
        const { container, unmount } = render(<FaceSvg spec={{ ...DEFAULT_FACE, [part]: i }} />);
        expect(container.querySelector("svg")).not.toBeNull();
        unmount();
      }
    }
  });

  it("trocar de peça muda o desenho", () => {
    const a = render(<FaceSvg spec={{ ...DEFAULT_FACE, mouth: 0 }} />).container.innerHTML;
    const b = render(<FaceSvg spec={{ ...DEFAULT_FACE, mouth: 9 }} />).container.innerHTML;
    expect(a).not.toBe(b);
  });
});
