import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AvatarPicker from "../../../src/components/student/AvatarPicker.jsx";

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
  it("shows a placeholder when no avatar is selected", () => {
    render(<AvatarPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByText("?")).toBeInTheDocument();
    expect(screen.queryByAltText("Seu avatar")).not.toBeInTheDocument();
  });

  it("shows the selected avatar image", () => {
    render(<AvatarPicker value="/avatars/avatar-01.svg" onChange={vi.fn()} />);
    expect(screen.getByAltText("Seu avatar")).toHaveAttribute("src", "/avatars/avatar-01.svg");
  });

  it("hides the camera option when isSecureContext is false", () => {
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    render(<AvatarPicker value={null} onChange={vi.fn()} />);
    expect(screen.queryByText("📷 Tirar foto")).not.toBeInTheDocument();
  });

  it("shows the camera option when isSecureContext is true", () => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    render(<AvatarPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByText("📷 Tirar foto")).toBeInTheDocument();
  });

  it("renders the full preset avatar grid (48 options)", () => {
    const { container } = render(<AvatarPicker value={null} onChange={vi.fn()} />);
    expect(container.querySelectorAll(".avatar-picker__option")).toHaveLength(48);
  });

  it("marks the preset matching the current value as selected", () => {
    const { container } = render(
      <AvatarPicker value="/avatars/avatar-02.svg" onChange={vi.fn()} />,
    );
    const options = container.querySelectorAll(".avatar-picker__option");
    expect(options[1]).toHaveClass("avatar-picker__option--selected");
    expect(options[0]).not.toHaveClass("avatar-picker__option--selected");
  });

  it("calls onChange with the preset URL when a preset is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<AvatarPicker value={null} onChange={onChange} />);
    const firstOption = container.querySelectorAll(".avatar-picker__option")[0];
    await user.click(firstOption);
    expect(onChange).toHaveBeenCalledWith("/avatars/avatar-01.svg");
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
