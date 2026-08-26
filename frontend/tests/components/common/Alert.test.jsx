import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Alert from "../../../src/components/common/Alert.jsx";

describe("Alert", () => {
  it("renders nothing when there are no children", () => {
    const { container } = render(<Alert kind="error">{null}</Alert>);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an error alert with role=alert", () => {
    render(<Alert kind="error">Falhou</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("Falhou");
  });

  it("renders a non-error alert with role=status", () => {
    render(<Alert kind="info">Info</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("Info");
  });
});
