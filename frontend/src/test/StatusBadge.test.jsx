import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import StatusBadge from "../components/StatusBadge";

describe("StatusBadge", () => {
  it("renders the status with spaces instead of underscores", () => {
    render(<StatusBadge value="on_track" />);
    expect(screen.getByText("on track")).toBeInTheDocument();
  });

  it("renders nothing for empty values", () => {
    const { container } = render(<StatusBadge value="" />);
    expect(container.firstChild).toBeNull();
  });

  it("falls back to default classes for unknown values", () => {
    render(<StatusBadge value="weird_value" />);
    const el = screen.getByText("weird value");
    expect(el.className).toMatch(/bg-slate-100/);
  });
});
