import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import HelpPage, { metadata } from "@/app/(app)/help/page";

vi.mock("@/components/help/faq-search", () => ({
  FaqSearch: ({ items }: { items: readonly unknown[] }) => (
    <div data-testid="faq-search">{items.length} preguntas</div>
  ),
}));

describe("HelpPage", () => {
  it("defines page metadata and composes the 18 FAQ catalog", () => {
    render(<HelpPage />);

    expect(metadata.title).toBe("Centro de ayuda | SIG-EPE");
    expect(screen.getByRole("heading", { name: /centro de ayuda/i })).toBeInTheDocument();
    expect(screen.getByTestId("faq-search")).toHaveTextContent("18 preguntas");
  });
});
