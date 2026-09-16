import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BudgetPreviewCard } from "@/components/requests/budget-preview-card";

describe("suppressed currency preview", () => {
  it("shows unavailable rather than a false clearance or an invented PEN value", () => {
    render(<BudgetPreviewCard preview={null} isLoading={false} error={null} canPreview={false} currency="USD" onRetry={vi.fn()} />);
    expect(screen.getByText(/Vista previa no disponible para solicitudes en dólares/)).toBeInTheDocument();
    expect(screen.queryByText(/No bloquea el envío/)).not.toBeInTheDocument();
    expect(screen.queryByText(/S\//)).not.toBeInTheDocument();
  });
});
