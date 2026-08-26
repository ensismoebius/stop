import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import EmojiBursts from "../../../src/components/common/EmojiBursts.jsx";

describe("EmojiBursts", () => {
  it("renders nothing when items is undefined", () => {
    const { container } = render(<EmojiBursts />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when items is an empty array", () => {
    const { container } = render(<EmojiBursts items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one span per item, positioned by x", () => {
    const items = [
      { id: 1, emoji: "🔥", x: 0 },
      { id: 2, emoji: "🎉", x: 1 },
    ];
    const { container } = render(<EmojiBursts items={items} />);
    const spans = container.querySelectorAll(".emoji-bursts__item");
    expect(spans).toHaveLength(2);
    expect(spans[0]).toHaveTextContent("🔥");
    expect(spans[0]).toHaveStyle({ left: "8%" });
    expect(spans[1]).toHaveStyle({ left: "92%" });
    expect(container.querySelector(".emoji-bursts")).toHaveAttribute("aria-hidden", "true");
  });
});
