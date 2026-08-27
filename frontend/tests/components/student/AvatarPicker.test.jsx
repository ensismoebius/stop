import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AvatarPicker from "../../../src/components/student/AvatarPicker.jsx";
import { DEFAULT_FACE, FACE_STEPS, decodeFace, encodeFace } from "../../../src/lib/face.js";
import { FACE_COUNTS } from "../../../src/data/faceParts.js";

/** Always resolves onload, mimicking a decoded image. */
class SuccessImage {
  set src(value) {
    this._src = value;
    this.width = 200;
    this.height = 100;
    queueMicrotask(() => this.onload && this.onload());
  }

  get src() {
    return this._src;
  }
}

/** Always fails to decode. */
class FailingImage {
  set src(value) {
    this._src = value;
    queueMicrotask(() => this.onerror && this.onerror());
  }

  get src() {
    return this._src;
  }
}

let originalIsSecureContext;
let originalImage;

beforeEach(() => {
  originalIsSecureContext = window.isSecureContext;
  originalImage = window.Image;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,resized",
  );
});

afterEach(() => {
  Object.defineProperty(window, "isSecureContext", {
    value: originalIsSecureContext,
    configurable: true,
  });
  window.Image = originalImage;
  vi.restoreAllMocks();
});

describe("AvatarPicker", () => {
  it("mostra o assistente quando não há foto", () => {
    const { container } = render(<AvatarPicker value={null} onChange={vi.fn()} />);
    expect(container.querySelector(".wz")).not.toBeNull();
    expect(container.querySelector(".wz__preview svg")).not.toBeNull();
  });

  it("começa na primeira etapa e avança uma de cada vez", async () => {
    const user = userEvent.setup();
    render(<AvatarPicker value={null} onChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: FACE_STEPS[0].title })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    expect(screen.getByRole("heading", { name: FACE_STEPS[1].title })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByRole("heading", { name: FACE_STEPS[0].title })).toBeInTheDocument();
  });

  it("não deixa voltar antes da primeira etapa nem avançar depois da última", async () => {
    const user = userEvent.setup();
    render(<AvatarPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Voltar" })).toBeDisabled();

    for (let i = 0; i < FACE_STEPS.length - 1; i += 1) {
      await user.click(screen.getByRole("button", { name: "Próximo" }));
    }
    expect(screen.getByRole("button", { name: "Pronto" })).toBeDisabled();
  });

  it("dá para pular direto para uma etapa pela trilha", async () => {
    const user = userEvent.setup();
    render(<AvatarPicker value={null} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: FACE_STEPS[3].title }));
    expect(screen.getByRole("heading", { name: FACE_STEPS[3].title })).toBeInTheDocument();
  });

  it("escolher um tom de pele grava o índice", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AvatarPicker value={encodeFace(DEFAULT_FACE)} onChange={onChange} />);

    const paleta = within(screen.getByRole("group", { name: "Tom de pele" }));
    await user.click(paleta.getByRole("button", { name: "Tom de pele 5" }));
    expect(decodeFace(onChange.mock.calls.at(-1)[0]).sk).toBe(4);
  });

  it("cada opção da galeria mostra o rosto do aluno com aquela peça", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<AvatarPicker value={encodeFace(DEFAULT_FACE)} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Próximo" })); // cabelo
    const options = container.querySelectorAll(".wz__option");
    expect(options.length).toBe(FACE_COUNTS.hair);
    // Cada miniatura é um rosto inteiro, não só a peça solta.
    expect(options[0].querySelector("svg")).not.toBeNull();

    await user.click(options[3]);
    expect(decodeFace(onChange.mock.calls.at(-1)[0]).hair).toBe(3);
  });

  it("o botão de sortear devolve um rosto válido", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AvatarPicker value={null} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "🎲" }));
    expect(decodeFace(onChange.mock.calls.at(-1)[0])).not.toBeNull();
  });

  it("com uma foto, mostra a foto e some com o montador", () => {
    const photo = "data:image/jpeg;base64,abc";
    const { container } = render(<AvatarPicker value={photo} onChange={vi.fn()} />);
    expect(container.querySelector(".fb")).toBeNull();
    expect(screen.getByRole("img")).toHaveAttribute("src", photo);
  });

  it("dá para trocar a foto pelo rosto montado", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AvatarPicker value="data:image/jpeg;base64,abc" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Montar um rosto/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("processes a captured photo through resize and calls onChange with the data URL", async () => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    window.Image = SuccessImage;
    const onChange = vi.fn();
    const { container } = render(<AvatarPicker value={null} onChange={onChange} />);

    const fileInput = container.querySelector(".avatar-picker__file-input");
    const file = new File(["fake-image-bytes"], "photo.jpg", { type: "image/jpeg" });
    await userEvent.setup().upload(fileInput, file);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("data:image/jpeg;base64,resized"));
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith("2d");
  });

  it("shows a busy label while processing, then clears it", async () => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    window.Image = SuccessImage;
    const { container } = render(<AvatarPicker value={null} onChange={vi.fn()} />);
    const fileInput = container.querySelector(".avatar-picker__file-input");
    const file = new File(["fake-image-bytes"], "photo.jpg", { type: "image/jpeg" });

    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(await screen.findByText("Processando...")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("📷 Tirar foto")).toBeInTheDocument());
  });

  it("shows an error message when the image fails to decode", async () => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    window.Image = FailingImage;
    const { container } = render(<AvatarPicker value={null} onChange={vi.fn()} />);
    const fileInput = container.querySelector(".avatar-picker__file-input");
    const file = new File(["fake-image-bytes"], "photo.jpg", { type: "image/jpeg" });

    await userEvent.setup().upload(fileInput, file);
    expect(await screen.findByText("Não foi possível carregar a foto")).toBeInTheDocument();
  });

  it("shows an error message when the file cannot be read", async () => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    window.Image = SuccessImage;
    const readSpy = vi
      .spyOn(FileReader.prototype, "readAsDataURL")
      .mockImplementation(function mockRead() {
        queueMicrotask(() => this.onerror && this.onerror());
      });
    const { container } = render(<AvatarPicker value={null} onChange={vi.fn()} />);
    const fileInput = container.querySelector(".avatar-picker__file-input");
    const file = new File(["fake-image-bytes"], "photo.jpg", { type: "image/jpeg" });

    await userEvent.setup().upload(fileInput, file);
    expect(await screen.findByText("Não foi possível ler a foto")).toBeInTheDocument();
    readSpy.mockRestore();
  });

  it("clicking 'Tirar foto' opens the hidden file picker", async () => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    const { container } = render(<AvatarPicker value={null} onChange={vi.fn()} />);
    const fileInput = container.querySelector(".avatar-picker__file-input");
    const clickSpy = vi.spyOn(fileInput, "click").mockImplementation(() => {});
    await userEvent.setup().click(screen.getByText("📷 Tirar foto"));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic message when the processing error has no message", async () => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    window.Image = SuccessImage;
    // Force resizePhoto's promise executor to throw synchronously with a
    // non-Error value, so the caught rejection has no `.message`.
    const readSpy = vi
      .spyOn(FileReader.prototype, "readAsDataURL")
      .mockImplementation(() => {
        throw { code: "WEIRD_FAILURE" };
      });
    const { container } = render(<AvatarPicker value={null} onChange={vi.fn()} />);
    const fileInput = container.querySelector(".avatar-picker__file-input");
    const file = new File(["fake-image-bytes"], "photo.jpg", { type: "image/jpeg" });

    await userEvent.setup().upload(fileInput, file);
    expect(await screen.findByText("Falha ao processar a foto")).toBeInTheDocument();
    readSpy.mockRestore();
  });

  it("does nothing when the file input change event carries no file", () => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    const onChange = vi.fn();
    const { container } = render(<AvatarPicker value={null} onChange={onChange} />);
    const fileInput = container.querySelector(".avatar-picker__file-input");

    fireEvent.change(fileInput, { target: { files: [] } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText(/Não foi possível/)).not.toBeInTheDocument();
  });
});
