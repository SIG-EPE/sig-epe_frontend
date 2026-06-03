import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RenditionsTable } from "@/components/renditions/renditions-table";
import { RENDITION_STATUS, REQUEST_STATUS, type RenditionInboxRow } from "@/types/requests";

function makeRendition(overrides: Partial<RenditionInboxRow> = {}): RenditionInboxRow {
  return {
    advance_id: "advance-1",
    request_code: "SOL-2026-001",
    requester: "Ana Pérez",
    org_unit: "Operaciones",
    concept: "Anticipo de viaje",
    requested_amount: 500,
    amount_paid: 500,
    paid_at: "2026-05-01T00:00:00.000Z",
    scheduled_rendition_at: "2026-05-10",
    rendition_status: RENDITION_STATUS.OVERDUE,
    days_overdue: 5,
    settlement_request_id: "settlement-1",
    settlement_status: REQUEST_STATUS.SUBMITTED,
    settlement_updated_at: "2026-05-02T00:00:00.000Z",
    settlement_submitted_at: "2026-05-02T00:00:00.000Z",
    settlement_document_count: 2,
    settlement_documents_complete: true,
    payment_proof_document_id: "doc-1",
    last_activity_at: "2026-05-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("RenditionsTable", () => {
  it("muestra datos operativos y acción REXAN vinculada", () => {
    render(<RenditionsTable renditions={[makeRendition()]} isLoading={false} />);

    expect(screen.getByText("SOL-2026-001")).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Vencida")).toBeInTheDocument();
    expect(screen.getByText("Sustentos completos")).toBeInTheDocument();
    expect(screen.getByText("5 días vencida")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver REXAN" })).toHaveAttribute("href", "/requests/settlement-1");
  });

  it("muestra estado vacío business-friendly", () => {
    render(<RenditionsTable renditions={[]} isLoading={false} />);

    expect(screen.getByText("No hay rendiciones para este filtro.")).toBeInTheDocument();
  });
});
