import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ConnectionBadge from "../../../src/components/common/ConnectionBadge.jsx";

describe("ConnectionBadge", () => {
  it("shows connected state", () => {
    render(<ConnectionBadge connected />);
    expect(screen.getByText("conectado")).toHaveClass("connection", "connection--on");
  });

  it("shows reconnecting state", () => {
    render(<ConnectionBadge connected={false} />);
    expect(screen.getByText("reconectando...")).toHaveClass("connection");
    expect(screen.getByText("reconectando...")).not.toHaveClass("connection--on");
  });
});
