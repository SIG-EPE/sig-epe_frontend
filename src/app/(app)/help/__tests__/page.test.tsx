import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import HelpPage, { metadata } from "@/app/(app)/help/page";

vi.mock("@/components/help/faq-search", () => ({
  FaqSearch: ({ items }: { items: readonly unknown[] }) => (
    <div data-testid="faq-search">{items.length} preguntas</div>
  ),
}));

describe("HelpPage", () => {
  it("defines page metadata, links the GIOF guide and composes the FAQ catalog", () => {
    render(<HelpPage />);

    expect(metadata.title).toBe("Centro de ayuda | SIG-EPE");
    expect(screen.getByRole("heading", { name: /centro de ayuda/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir guía" })).toHaveAttribute("href", "/help/giof-assignment");
    expect(screen.getByTestId("faq-search")).toHaveTextContent("19 preguntas");
  });
});
