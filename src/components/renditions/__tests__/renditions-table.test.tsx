import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RenditionsTable } from "@/components/renditions/renditions-table";
import { RENDITION_DEADLINE_STATE, RENDITION_STATUS, REQUEST_STATUS, type RenditionInboxRow } from "@/types/requests";

function makeRendition(overrides: Partial<RenditionInboxRow> = {}): RenditionInboxRow {
  return {
    advance_id: "advance-1",
    request_code: "SOL-2026-001",
    requester: "Ana Pérez",
    registered_by: "Ana Pérez",
    registered_party_name: "Proveedor SAC",
    registered_party_document_type: "RUC",
    registered_party_document_number: "20123456789",
    org_unit: "Operaciones",
    concept: "Anticipo de viaje",
    requested_amount: 500,
    amount_paid: 500,
    paid_at: "2026-05-01T00:00:00.000Z",
    scheduled_rendition_at: "2026-05-10",
    deadline_date: "2026-05-10",
    deadline_state: RENDITION_DEADLINE_STATE.OVERDUE,
    calendar_days_to_deadline: -5,
    rendition_status: RENDITION_STATUS.OVERDUE,
    days_overdue: 5,
    days_until_due: null,
    days_remaining: -5,
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
  it("asigna usando el settlement vinculado en estados activos y deshabilita una rendida", async () => {
    const user = userEvent.setup();
    const onToggleAssignment = vi.fn();
    const work = { requestId: "settlement-active", pool: "REXAN" as const, assigneeId: null, assigneeName: null, assignmentVersion: "0", lease: null, canAcquire: false, canEdit: false, readOnly: true };
    render(<RenditionsTable
      renditions={[
        makeRendition({ advance_id: "active", request_code: "REXAN-ACTIVE", settlement_request_id: "settlement-active", giof_work: { ...work, canAssign: true } }),
        makeRendition({ advance_id: "observed", request_code: "REXAN-OBSERVED", settlement_request_id: "settlement-observed", settlement_status: REQUEST_STATUS.OBSERVED, rendition_status: RENDITION_STATUS.OBSERVED, giof_work: { ...work, requestId: "settlement-observed", assignmentVersion: "3", canAssign: true } }),
        makeRendition({ advance_id: "settled", request_code: "REXAN-SETTLED", settlement_request_id: "settlement-closed", settlement_status: REQUEST_STATUS.CLOSED, rendition_status: RENDITION_STATUS.SETTLED, giof_work: { ...work, requestId: "settlement-closed", canAssign: false } }),
      ]}
      isLoading={false}
      isGiofManager
      onToggleAssignment={onToggleAssignment}
      onToggleAllAssignments={() => undefined}
    />);

    expect(screen.getByRole("checkbox", { name: "Seleccionar REXAN-ACTIVE para asignar" })).toBeEnabled();
    await user.click(screen.getByRole("checkbox", { name: "Seleccionar REXAN-OBSERVED para asignar" }));
    expect(onToggleAssignment).toHaveBeenCalledWith("settlement-observed", true);
    expect(screen.getByRole("checkbox", { name: "REXAN-SETTLED: rendición finalizada" })).toBeDisabled();
  });

  it("muestra datos operativos y acción REXAN vinculada", () => {
    render(<RenditionsTable renditions={[makeRendition()]} isLoading={false} />);

    expect(screen.getByText("SOL-2026-001")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "A nombre de" })).toBeInTheDocument();
    expect(screen.getByText("Proveedor SAC")).toBeInTheDocument();
    expect(screen.getByText("RUC 20123456789")).toBeInTheDocument();
    expect(screen.getByText("Registrado por: Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Vencida")).toBeInTheDocument();
    expect(screen.getByText("Enviada a revisión")).toHaveAccessibleName("Lifecycle de rendición: Enviada a revisión");
    expect(screen.getByText("Sustentos completos")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Plazo" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Días" })).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /Plazo: .*10 may\. 2026.*Vencida hace 5 días/i })).toBeInTheDocument();
    expect(screen.getByText("Vencida hace 5 días")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver REXAN" })).toHaveAttribute("href", "/requests/settlement-1");
  });

  it("separa el estado derivado del lifecycle de rendición y conserva fallback legacy legible", () => {
    render(<RenditionsTable renditions={[
      makeRendition({
        advance_id: "in-review-draft",
        rendition_status: RENDITION_STATUS.IN_REVIEW,
        settlement_status: REQUEST_STATUS.DRAFT,
      }),
      makeRendition({
        advance_id: "legacy-derived",
        rendition_status: "LEGACY_RENDITION" as RenditionInboxRow["rendition_status"],
        settlement_status: REQUEST_STATUS.REJECTED,
      }),
    ]} isLoading={false} />);

    expect(screen.getByLabelText("Estado derivado de rendición: En revisión")).toBeInTheDocument();
    expect(screen.getByLabelText("Lifecycle de rendición: En preparación")).toBeInTheDocument();
    expect(screen.getByLabelText("Lifecycle de rendición: Rendición rechazada")).toBeInTheDocument();
    expect(screen.getByLabelText("Estado derivado de rendición: Estado no reconocido (LEGACY_RENDITION)")).toBeInTheDocument();
  });

  it("muestra fecha y lifecycle presentado o completado mediante texto accesible", () => {
    render(<RenditionsTable renditions={[
      makeRendition({
        advance_id: "presented",
        request_code: "REXAN-PRESENTADA",
        deadline_state: RENDITION_DEADLINE_STATE.PRESENTED,
        calendar_days_to_deadline: null,
      }),
      makeRendition({
        advance_id: "completed",
        request_code: "REXAN-RENDIDA",
        deadline_state: RENDITION_DEADLINE_STATE.COMPLETED,
        calendar_days_to_deadline: null,
      }),
    ]} isLoading={false} />);

    expect(screen.getByRole("cell", { name: /Plazo: .*Presentada/i })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /Plazo: .*Rendida/i })).toBeInTheDocument();
    expect(screen.queryByText("Sin fecha límite")).not.toBeInTheDocument();
  });

  it("muestra estado vacío business-friendly", () => {
    render(<RenditionsTable renditions={[]} isLoading={false} />);

    expect(screen.getByText("No hay rendiciones para este filtro.")).toBeInTheDocument();
  });

  it("no usa registrante como fallback de A nombre de", () => {
    render(<RenditionsTable renditions={[makeRendition({ registered_party_name: null, registered_party_document_type: null, registered_party_document_number: null })]} isLoading={false} />);

    expect(screen.getByText("Registrado por: Ana Pérez")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
