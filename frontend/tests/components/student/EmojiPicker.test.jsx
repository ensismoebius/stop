import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmojiPicker, { EMOJI_REACTIONS } from "../../../src/components/student/EmojiPicker.jsx";

describe("EmojiPicker", () => {
  it("renders a button for every reaction", () => {
    render(<EmojiPicker onSend={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(EMOJI_REACTIONS.length);
    for (const emoji of EMOJI_REACTIONS) {
      expect(screen.getByRole("button", { name: `Enviar reação ${emoji}` })).toBeInTheDocument();
    }
  });

  it("calls onSend with the clicked emoji", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<EmojiPicker onSend={onSend} />);
    await user.click(screen.getByRole("button", { name: `Enviar reação ${EMOJI_REACTIONS[0]}` }));
    expect(onSend).toHaveBeenCalledWith(EMOJI_REACTIONS[0]);
  });

  it("groups the buttons under a labeled group", () => {
    render(<EmojiPicker onSend={vi.fn()} />);
    expect(screen.getByRole("group", { name: "Enviar reação" })).toBeInTheDocument();
  });
});
