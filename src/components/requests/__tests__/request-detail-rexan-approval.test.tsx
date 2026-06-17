import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequestDetailPage } from "@/components/requests/request-detail-page";
import { REQUEST_CURRENCY, REQUEST_DOCUMENT_CATEGORY, REQUEST_DOCUMENT_SCOPE_TYPE, REQUEST_DOCUMENT_STORAGE_PROVIDER, REQUEST_DOCUMENT_UPLOAD_STATUS, REQUEST_RENDITION_REPORT_STATUS, REQUEST_STATUS, REQUEST_TYPE, REXAN_OUTCOME, type PaymentRequest, type RequestDocument, type RequestRenditionReport } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  approveRequest: vi.fn(),
  observeRequest: vi.fn(),
  rejectRequest: vi.fn(),
  startAdvanceSettlement: vi.fn(),
  useRequest: vi.fn(),
  useRequestDocuments: vi.fn(),
  useRequestRenditionReport: vi.fn(),
  requestRefetch: vi.fn(),
  documentsRefetch: vi.fn(),
  reportRefetch: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "rexan-1" }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { id: "giof-1", role: { code: "GIOF_GESTOR", name: "GIOF Gestor" } },
  }),
}));

vi.mock("@/hooks/use-requests", () => ({
  useRequest: (id?: string) => mocks.useRequest(id),
  useRequestDocuments: (id?: string) => mocks.useRequestDocuments(id),
  useRequestRenditionReport: (id?: string, enabled?: boolean) => mocks.useRequestRenditionReport(id, enabled),
  useApproveRequest: () => ({ approveRequest: mocks.approveRequest, isLoading: false }),
  useObserveRequest: () => ({ observeRequest: mocks.observeRequest, isLoading: false }),
  useRejectRequest: () => ({ rejectRequest: mocks.rejectRequest, isLoading: false }),
  useStartAdvanceSettlement: () => ({ startAdvanceSettlement: mocks.startAdvanceSettlement, isLoading: false }),
}));

vi.mock("@/components/requests/request-status-stepper", () => ({
  RequestStatusStepper: () => <div data-testid="request-status-stepper" />,
}));

vi.mock("@/components/requests/request-documents-card", () => ({
  RequestDocumentsCard: () => <div data-testid="request-documents-card" />,
}));

vi.mock("@/components/requests/structured-rendition-report-card", () => ({
  StructuredRenditionReportCard: () => <div data-testid="structured-rendition-report-card" />,
}));

vi.mock("@/components/requests/status-badge", () => ({
  StatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
}));

function makeRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "rexan-1",
    request_code: "REXAN-1",
    sequential_number: null,
    request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
    status: REQUEST_STATUS.SUBMITTED,
    fiscal_year: 2026,
    requested_amount: 100,
    currency: REQUEST_CURRENCY.PEN,
    concept: "Rendición REXAN",
    requester_id: "user-1",
    budget_planning_line_id: null,
    budget_month: 1,
    organizational_unit_id: null,
    scheduled_rendition_at: null,
    related_request_id: null,
    supplier_ruc: null,
    supplier_name: null,
    document_type: null,
    has_associated_contract: false,
    beneficiary_name: "Beneficiario",
    beneficiary_document_type: null,
    beneficiary_document_number: null,
    bank_code: null,
    bank_name: null,
    account_type: null,
    bank_account: null,
    bank_cci: null,
    submitted_at: "2026-05-01T10:00:00.000Z",
    observed_at: null,
    approved_at: null,
    rejected_at: null,
    paid_at: null,
    disbursed_at: null,
    amount_disbursed: null,
    notes: null,
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeDocument(overrides: Partial<RequestDocument> = {}): RequestDocument {
  return {
    id: "return-proof-1",
    payment_request_id: "rexan-1",
    document_category: REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF,
    safe_filename: "constancia.pdf",
    original_filename: "constancia.pdf",
    mime_type: "application/pdf",
    size_bytes: 1024,
    storage_provider: REQUEST_DOCUMENT_STORAGE_PROVIDER.DRIVE,
    upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
    scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.REQUEST,
    request_allocation_id: null,
    created_at: "2026-05-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeLineReturnProof(overrides: Partial<RequestDocument> = {}): RequestDocument {
  return makeDocument({
    id: "line-proof-1",
    original_filename: "constancia-linea-1.pdf",
    safe_filename: "constancia-linea-1.pdf",
    scope_type: REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION,
    request_allocation_id: "allocation-1",
    drive_web_url: "https://drive.example/constancia-linea-1",
    ...overrides,
  });
}

function makeReport(overrides: Partial<RequestRenditionReport> = {}): RequestRenditionReport {
  const totalAmount = overrides.total_amount ?? overrides.totals?.total_amount ?? 100;
  return {
    id: "report-1",
    request_id: "rexan-1",
    status: REQUEST_RENDITION_REPORT_STATUS.EXPORTED,
    total_amount: totalAmount,
    currency: REQUEST_CURRENCY.PEN,
    settlement_report_document_id: "generated-report-1",
    drive_sync_status: "SYNCED",
    drive_sync_error: null,
    submitted_at: null,
    exported_at: "2026-05-02T10:00:00.000Z",
    rows: [],
    totals: { total_amount: totalAmount, by_allocation: [], missing_allocations: [] },
    allocation_coverage: [],
    ...overrides,
  };
}

function makeStructuredDevolucionReport(incomplete = false): RequestRenditionReport {
  return makeReport({
    total_amount: 80,
    totals: { total_amount: 80, by_allocation: [], missing_allocations: [] },
    allocation_coverage: [
      {
        request_allocation_id: "allocation-1",
        request_allocation_label: "Materiales escolares",
        line_code: "POA-001",
        planned_amount: 100,
        row_total_amount: 80,
        paid_base_amount: 100,
        rendered_amount: 80,
        expected_return_amount: 20,
        returned_amount: incomplete ? 0 : 20,
        row_count: 1,
        has_rows: true,
        line_return: incomplete ? null : {
          id: "line-return-1",
          returned_amount: 20,
          justification: "Saldo no utilizado",
          return_proof_document_id: "line-proof-1",
          return_proof_filename: "constancia-linea-1.pdf",
          status: "VALID",
          validated_at: null,
        },
      },
      {
        request_allocation_id: "allocation-2",
        request_allocation_label: "Movilidad local",
        line_code: "POA-002",
        planned_amount: 50,
        row_total_amount: 50,
        paid_base_amount: 50,
        rendered_amount: 50,
        expected_return_amount: 0,
        returned_amount: 0,
        row_count: 1,
        has_rows: true,
        line_return: null,
      },
    ],
  });
}

async function openApproveDialogAndSetAmount(amount: string) {
  const user = userEvent.setup();
  render(<RequestDetailPage />);

  await user.click(screen.getByRole("button", { name: "Aprobar rendición" }));
  const spentInput = screen.getByLabelText("Gasto validado *");
  await user.clear(spentInput);
  await user.type(spentInput, amount);
  return user;
}

describe("RequestDetailPage REXAN approval", () => {
  beforeEach(() => {
    mocks.approveRequest.mockResolvedValue(makeRequest({ status: REQUEST_STATUS.APPROVED }));
    mocks.useRequest.mockReturnValue({ request: makeRequest(), isLoading: false, error: null, refetch: mocks.requestRefetch });
    mocks.useRequestDocuments.mockReturnValue({ documents: [], isLoading: false, error: null, refetch: mocks.documentsRefetch });
    mocks.useRequestRenditionReport.mockReturnValue({ report: null, isLoading: false, error: null, refetch: mocks.reportRefetch });
  });

  it("aprueba REXAN EXACT con validated_spent_amount y sin campos de devolución ni nota legacy", async () => {
    const user = await openApproveDialogAndSetAmount("100");

    expect(screen.getByText("Monto del anticipo")).toBeInTheDocument();
    expect(screen.getByText("Compara el gasto validado con el monto del anticipo. Si es igual, la rendición se aprueba sin saldo; si es menor, se registra devolución; si es mayor, el saldo adicional pasa a Cola de Pagos.")).toBeInTheDocument();
    expect(screen.getByText("Rendición exacta: no queda saldo pendiente.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Aprobar rendición" }).at(-1)!);

    await waitFor(() => {
      expect(mocks.approveRequest).toHaveBeenCalledWith("rexan-1", {
        comment: undefined,
        validated_spent_amount: 100,
      });
    });
    const payload = mocks.approveRequest.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("return_proof_document_id");
    expect(payload).not.toHaveProperty("rexan_validation_note");
  });

  it("bloquea DEVOLUCION sin constancia y guía a observar la rendición", async () => {
    const user = await openApproveDialogAndSetAmount("80");

    expect(screen.getByText(/Devolución: se debe registrar constancia por S\/\s*20\.00\./)).toBeInTheDocument();
    expect(screen.getByText(/Obligatorio para devolución: selecciona una constancia de devolución por S\/\s*20\.00 antes de aprobar\./)).toBeInTheDocument();
    expect(screen.getByText(/Para aprobar una devolución, primero solicita al solicitante que vaya a Saldos por línea POA, use Registrar devolución/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Aprobar rendición" }).at(-1)!).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Solicitar constancia" }));

    expect(mocks.approveRequest).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Campo relacionado")).toHaveValue("Constancia de devolución");
    expect((screen.getByLabelText("Comentario *") as HTMLTextAreaElement).value).toMatch(/Saldos por línea POA → Registrar devolución/);
    expect((screen.getByLabelText("Comentario *") as HTMLTextAreaElement).value).toMatch(/regenera el informe actualizado antes de reenviar la rendición/);
  });

  it("envía la constancia RETURN_PROOF seleccionada para DEVOLUCION", async () => {
    mocks.useRequestDocuments.mockReturnValue({ documents: [makeDocument()], isLoading: false, error: null, refetch: mocks.documentsRefetch });
    const user = await openApproveDialogAndSetAmount("80");

    expect(screen.getByText(/Obligatorio para devolución: selecciona una constancia de devolución por S\/\s*20\.00 antes de aprobar\./)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Aprobar rendición" }).at(-1)!).toBeEnabled();
    await user.click(screen.getAllByRole("button", { name: "Aprobar rendición" }).at(-1)!);

    await waitFor(() => {
      expect(mocks.approveRequest).toHaveBeenCalledWith("rexan-1", {
        comment: undefined,
        validated_spent_amount: 80,
        return_proof_document_id: "return-proof-1",
      });
    });
  });

  it("aprueba REXAN EXCESS con saldo previsto y sin constancia de devolución", async () => {
    const user = await openApproveDialogAndSetAmount("125.55");

    expect(screen.getByText("Saldo a pagar")).toBeInTheDocument();
    expect(screen.getByText(/Saldo adicional por pagar: S\/\s*25\.55 pasará a Cola de Pagos\./)).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Aprobar rendición" }).at(-1)!);

    await waitFor(() => {
      expect(mocks.approveRequest).toHaveBeenCalledWith("rexan-1", {
        comment: undefined,
        validated_spent_amount: 125.55,
      });
    });
    expect(mocks.approveRequest.mock.calls[0][1]).not.toHaveProperty("return_proof_document_id");
  });

  it("muestra resultado calculado para informe generado estructurado y no pide gasto manual", async () => {
    const user = userEvent.setup();
    mocks.useRequestRenditionReport.mockReturnValue({ report: makeReport({ total_amount: 100 }), isLoading: false, error: null, refetch: mocks.reportRefetch });

    render(<RequestDetailPage />);
    await user.click(screen.getByRole("button", { name: "Aprobar rendición" }));

    expect(screen.getByText("Resultado calculado")).toBeInTheDocument();
    expect(screen.getByText("Total rendido")).toBeInTheDocument();
    expect(screen.getByText("Anticipo")).toBeInTheDocument();
    expect(screen.getByText("Exacta")).toBeInTheDocument();
    expect(screen.queryByLabelText("Gasto validado *")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Aprobar rendición" }).at(-1)!);

    await waitFor(() => {
      expect(mocks.approveRequest).toHaveBeenCalledWith("rexan-1", { comment: undefined });
    });
    expect(mocks.approveRequest.mock.calls[0][1]).not.toHaveProperty("validated_spent_amount");
  });

  it.each([
    { total: 100, label: "Exacta", difference: /No queda diferencia pendiente/i },
    { total: 80, label: "Devolución pendiente", difference: /Diferencia a devolver: S\/\s*20\.00\./ },
    { total: 125.55, label: "Saldo adicional por pagar", difference: /Diferencia por pagar: S\/\s*25\.55\./ },
  ])("renderiza resultado calculado $label para informe generado", async ({ total, label, difference }) => {
    const user = userEvent.setup();
    mocks.useRequestRenditionReport.mockReturnValue({ report: makeReport({ total_amount: total }), isLoading: false, error: null, refetch: mocks.reportRefetch });
    if (total === 80) {
      mocks.useRequestDocuments.mockReturnValue({ documents: [makeDocument()], isLoading: false, error: null, refetch: mocks.documentsRefetch });
    }

    render(<RequestDetailPage />);
    await user.click(screen.getByRole("button", { name: "Aprobar rendición" }));

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText(difference)).toBeInTheDocument();
  });

  it("aprueba devolución estructurada completa con checklist por línea y omite constancia global", async () => {
    const user = userEvent.setup();
    mocks.useRequestRenditionReport.mockReturnValue({ report: makeStructuredDevolucionReport(), isLoading: false, error: null, refetch: mocks.reportRefetch });
    mocks.useRequestDocuments.mockReturnValue({ documents: [makeLineReturnProof()], isLoading: false, error: null, refetch: mocks.documentsRefetch });

    render(<RequestDetailPage />);
    await user.click(screen.getByRole("button", { name: "Aprobar rendición" }));

    expect(screen.getByText("Constancias de devolución por línea POA")).toBeInTheDocument();
    expect(screen.getByText("POA-001 - Materiales escolares")).toBeInTheDocument();
    expect(screen.getByText("constancia-linea-1.pdf")).toBeInTheDocument();
    expect(screen.getByText("válida")).toBeInTheDocument();
    expect(screen.queryByLabelText("Constancia de devolución *")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Aprobar rendición" }).at(-1)!);

    await waitFor(() => {
      expect(mocks.approveRequest).toHaveBeenCalledWith("rexan-1", { comment: undefined });
    });
    expect(mocks.approveRequest.mock.calls[0][1]).not.toHaveProperty("validated_spent_amount");
    expect(mocks.approveRequest.mock.calls[0][1]).not.toHaveProperty("return_proof_document_id");
  });

  it("bloquea devolución estructurada cuando una línea requerida está pendiente", async () => {
    const user = userEvent.setup();
    mocks.useRequestRenditionReport.mockReturnValue({ report: makeStructuredDevolucionReport(true), isLoading: false, error: null, refetch: mocks.reportRefetch });

    render(<RequestDetailPage />);
    await user.click(screen.getByRole("button", { name: "Aprobar rendición" }));

    expect(screen.getByText("POA-001 - Materiales escolares")).toBeInTheDocument();
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(0);
    expect(screen.getByText("pendiente")).toBeInTheDocument();
    expect(screen.getByText(/Observa la rendición y solicita corregir Saldos por línea POA > Registrar devolución/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Aprobar rendición" }).at(-1)!).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Solicitar corrección de devolución" }));
    expect(mocks.approveRequest).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Comentario *") as HTMLTextAreaElement).value).toMatch(/Saldos por línea POA → Registrar devolución/);
  });

  it("mantiene el gasto manual obligatorio cuando no hay informe generado", async () => {
    const user = userEvent.setup();
    render(<RequestDetailPage />);

    await user.click(screen.getByRole("button", { name: "Aprobar rendición" }));
    expect(screen.getByLabelText("Gasto validado *")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Aprobar rendición" }).at(-1)!);

    expect(mocks.toastError).toHaveBeenCalledWith("Ingresa el gasto validado de la rendición.");
    expect(mocks.approveRequest).not.toHaveBeenCalled();
  });

  it("mantiene aprobación normal sin campos REXAN para solicitudes no rendición", async () => {
    const user = userEvent.setup();
    mocks.useRequest.mockReturnValue({
      request: makeRequest({ request_type: REQUEST_TYPE.REIMBURSEMENT, concept: "Reembolso normal", rexan_outcome: REXAN_OUTCOME.EXACT }),
      isLoading: false,
      error: null,
      refetch: mocks.requestRefetch,
    });

    render(<RequestDetailPage />);
    await user.click(screen.getByRole("button", { name: "Aprobar" }));
    await user.click(screen.getAllByRole("button", { name: "Aprobar solicitud" }).at(-1)!);

    await waitFor(() => {
      expect(mocks.approveRequest).toHaveBeenCalledWith("rexan-1", { comment: undefined });
    });
    const payload = mocks.approveRequest.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("validated_spent_amount");
    expect(payload).not.toHaveProperty("return_proof_document_id");
  });
});
