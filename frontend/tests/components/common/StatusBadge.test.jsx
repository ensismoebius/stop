import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import StatusBadge from "../../../src/components/common/StatusBadge.jsx";

describe("StatusBadge", () => {
  it("renders nothing when status is falsy", () => {
    const { container } = render(<StatusBadge status={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["WAITING", "aguardando", "badge--waiting"],
    ["READY", "pronto", "badge--waiting"],
    ["PLAYING", "jogando", "badge--playing"],
    ["SUBMITTED", "deu stop", "badge--submitted"],
    ["ELIMINATED", "eliminado", "badge--eliminated"],
    ["FINISHED", "encerrado", "badge--waiting"],
  ])("renders known status %s as %s", (status, text, modifierClass) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(text);
    expect(badge).toHaveClass("badge", modifierClass);
  });

  it("falls back to a lowercased label for an unknown status", () => {
    render(<StatusBadge status="MYSTERY" />);
    const badge = screen.getByText("mystery");
    expect(badge).toHaveClass("badge", "badge--waiting");
  });
});
