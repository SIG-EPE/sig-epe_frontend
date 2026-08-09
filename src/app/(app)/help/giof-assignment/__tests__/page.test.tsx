import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GiofAssignmentHelpPage, { metadata } from "@/app/(app)/help/giof-assignment/page";

vi.mock("@/components/help/giof-assignment-guide", () => ({
  GiofAssignmentGuide: () => <div>Guía GIOF renderizada</div>,
}));

describe("GiofAssignmentHelpPage", () => {
  it("expone la ruta especializada y sus metadatos", () => {
    render(<GiofAssignmentHelpPage />);

    expect(metadata.title).toBe("Guía de asignación GIOF | SIG-EPE");
    expect(screen.getByText("Guía GIOF renderizada")).toBeInTheDocument();
  });
});
