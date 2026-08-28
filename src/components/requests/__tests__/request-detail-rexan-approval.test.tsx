import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequestDetailPage } from "@/components/requests/request-detail-page";
import { REQUEST_CURRENCY, REQUEST_DOCUMENT_CATEGORY, REQUEST_DOCUMENT_SCOPE_TYPE, REQUEST_DOCUMENT_STORAGE_PROVIDER, REQUEST_DOCUMENT_UPLOAD_STATUS, REQUEST_RENDITION_REPORT_STATUS, REQUEST_STATUS, REQUEST_TYPE, REXAN_OUTCOME, type PaymentRequest, type RequestDocument, type RequestRenditionReport, type SettlementContextResponse } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  approveRequest: vi.fn(),
  observeRequest: vi.fn(),
  rejectRequest: vi.fn(),
  startAdvanceSettlement: vi.fn(),
  retryRexanActivation: vi.fn(),
  useRequest: vi.fn(),
  useRequestDocuments: vi.fn(),
  useRequestRenditionReport: vi.fn(),
  useSettlementContext: vi.fn(),
  requestRefetch: vi.fn(),
  documentsRefetch: vi.fn(),
  reportRefetch: vi.fn(),
  settlementContextRefetch: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "rexan-1" }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
  useSettlementContext: (id?: string, enabled?: boolean) => mocks.useSettlementContext(id, enabled),
  useApproveRequest: () => ({ approveRequest: mocks.approveRequest, isLoading: false }),
  useObserveRequest: () => ({ observeRequest: mocks.observeRequest, isLoading: false }),
  useRejectRequest: () => ({ rejectRequest: mocks.rejectRequest, isLoading: false }),
  useStartAdvanceSettlement: () => ({ startAdvanceSettlement: mocks.startAdvanceSettlement, isLoading: false }),
  useRetryRexanActivation: () => ({ retryRexanActivation: mocks.retryRexanActivation, isLoading: false }),
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
    giof_work: {
      pool: "REXAN",
      assigneeId: "giof-1",
      assigneeName: "Gestor Uno",
      assignmentVersion: "1",
      lease: { ownerId: "giof-1", heartbeatAt: "2026-05-01T10:00:00.000Z", expiresAt: "2099-05-01T10:05:00.000Z" },
      canAssign: true,
      canAcquire: true,
      canEdit: true,
      readOnly: false,
    },
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

function makeSettlementContext(overrides: Partial<SettlementContextResponse> = {}): SettlementContextResponse {
  const originalProof = makeDocument({
    id: "original-proof-1",
    payment_request_id: "advance-1",
    document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
    original_filename: "constancia-original.pdf",
    safe_filename: "constancia-original.pdf",
    drive_web_url: "https://drive.example/original-proof",
  });

  return {
    settlement: {
      id: "rexan-1",
      request_code: "REXAN-1",
      sequential_number: null,
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      status: REQUEST_STATUS.SUBMITTED,
      requested_amount: 100,
      currency: REQUEST_CURRENCY.PEN,
      concept: "Rendición REXAN",
      related_request_id: "advance-1",
    },
    original_advance: {
      id: "advance-1",
      request_code: "SOL-ORIG-1",
      sequential_number: null,
      requested_amount: 100,
      currency: REQUEST_CURRENCY.PEN,
      concept: "Anticipo inicial",
      requester_id: "user-1",
      beneficiary_name: null,
      budget_planning_line_id: null,
      scheduled_rendition_at: "2026-06-30",
      paid_at: "2026-06-01T10:00:00.000Z",
      disbursed_at: "2026-06-01T10:00:00.000Z",
      amount_disbursed: 100,
      allocations: [],
    },
    original_advance_documents: [],
    payment: {
      id: "original-payment-1",
      paid_at: "2026-06-01T10:00:00.000Z",
      amount_paid: 100,
      proof_document_id: "original-proof-1",
      proof_pending: false,
      details_pending: false,
      operation_reference: "OP-ORIGINAL",
      proof_document: originalProof,
    },
    due_date: null,
    rexan: null,
    settlement_documents: [],
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
    mocks.useRequest.mockReturnValue({ request: makeRequest(), isLoading: false, error: null, refetch: mocks.requestRefetch, patchRequest: vi.fn() });
    mocks.useRequestDocuments.mockReturnValue({ documents: [], isLoading: false, error: null, refetch: mocks.documentsRefetch });
    mocks.useRequestRenditionReport.mockReturnValue({ report: null, isLoading: false, error: null, refetch: mocks.reportRefetch });
    mocks.useSettlementContext.mockReturnValue({ context: null, isLoading: false, error: null, refetch: mocks.settlementContextRefetch });
  });

  it("mantiene el detalle sin acciones mutantes cuando el trabajo pertenece a otra persona", () => {
    mocks.useRequest.mockReturnValue({
      request: makeRequest({
        giof_work: {
          pool: "REXAN",
          assigneeId: "giof-2",
          assigneeName: "Otra Gestora",
          assignmentVersion: "2",
          lease: null,
          canAssign: true,
          canAcquire: false,
          canEdit: false,
          readOnly: true,
        },
      }),
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: mocks.requestRefetch,
      patchRequest: vi.fn(),
    });

    render(<RequestDetailPage />);

    expect(screen.getByText("Asignada a Otra Gestora")).toBeInTheDocument();
    expect(screen.getByText(/Vista de solo lectura/)).toBeInTheDocument();
    expect(screen.queryByText("Acciones de revisión")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Observar rendición" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprobar rendición" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rechazar rendición" })).not.toBeInTheDocument();
  });

  it("muestra quién creó un reembolso en Datos principales", () => {
    mocks.useRequest.mockReturnValue({
      request: makeRequest({
        request_type: REQUEST_TYPE.REIMBURSEMENT,
        concept: "Reembolso SST",
        beneficiary_name: "Beneficiario cuenta",
        beneficiary_document_type: "DNI",
        beneficiary_document_number: "12345678",
        requester_name: "Ana Paredes",
      }),
      isLoading: false,
      error: null,
      refetch: mocks.requestRefetch,
      patchRequest: vi.fn(),
    });

    render(<RequestDetailPage />);

    expect(screen.getByText("Registrado por")).toBeInTheDocument();
    expect(screen.getByText("Ana Paredes")).toBeInTheDocument();
    expect(screen.getAllByText("A nombre de").length).toBeGreaterThan(0);
    expect(screen.getByText("Beneficiario cuenta")).toBeInTheDocument();
    expect(screen.getByText("DNI 12345678")).toBeInTheDocument();
  });

  it("muestra a GIOF que el solicitante prepara la rendición después del pago", () => {
    mocks.useRequest.mockReturnValue({
      request: makeRequest({
        id: "advance-1",
        request_code: "SOL-2026-0001",
        request_type: REQUEST_TYPE.ADVANCE,
        status: REQUEST_STATUS.PAID,
        requester_id: "user-1",
        scheduled_rendition_at: "2026-06-30",
        paid_at: "2026-06-01T10:00:00.000Z",
      }),
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: mocks.requestRefetch,
      patchRequest: vi.fn(),
    });

    render(<RequestDetailPage />);

    expect(screen.getByText("Siguiente paso: espera de rendición del solicitante")).toBeInTheDocument();
    expect(screen.getByText(/El solicitante prepara y envía la rendición/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ir a Bandeja de Rendiciones" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar rendición" })).not.toBeInTheDocument();
  });

  it("muestra el estado durable de activación REXAN tras recargar el detalle", () => {
    mocks.useRequest.mockReturnValue({
      request: makeRequest({
        id: "advance-1",
        request_type: REQUEST_TYPE.ADVANCE,
        status: REQUEST_STATUS.PAID,
        rexan_activation: {
          job_id: "job-1",
          status: "RETRYING",
          attempt_count: 2,
          next_attempt_at: "2026-07-26T18:00:00.000Z",
        },
      }),
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: mocks.requestRefetch,
      patchRequest: vi.fn(),
    });

    render(<RequestDetailPage />);

    const card = screen.getByTestId("rexan-activation-state-card");
    expect(within(card).getByText("REXAN: procesando")).toBeInTheDocument();
    expect(within(card).getByText("2")).toBeInTheDocument();
  });

  it("muestra Pago y constancia en una solicitud original pagada con constancia propia", () => {
    const proofDocument = makeDocument({
      id: "payment-proof-1",
      payment_request_id: "advance-1",
      document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
      original_filename: "constancia-pago.pdf",
      safe_filename: "constancia-pago.pdf",
      drive_web_url: "https://drive.example/payment-proof",
    });
    mocks.useRequest.mockReturnValue({
      request: makeRequest({
        id: "advance-1",
        request_code: "SOL-ORIG-1",
        request_type: REQUEST_TYPE.ADVANCE,
        status: REQUEST_STATUS.PAID,
        payment: {
          id: "payment-1",
          payment_request_id: "advance-1",
          paid_at: "2026-06-01T10:00:00.000Z",
          operation_reference: "OP-123",
          amount_paid: 100,
          bank_commission: null,
          notes: null,
          proof_document_id: "payment-proof-1",
          proofDocument: proofDocument,
          registered_by_id: "giof-1",
          created_at: "2026-06-01T10:00:00.000Z",
          updated_at: "2026-06-01T10:00:00.000Z",
          proof_entries: [],
        },
      }),
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: mocks.requestRefetch,
      patchRequest: vi.fn(),
    });

    render(<RequestDetailPage />);

    const paymentCard = screen.getByTestId("request-payment-proof-card");
    expect(within(paymentCard).getByText("Pago y constancia")).toBeInTheDocument();
    expect(within(paymentCard).getByText("Constancia de pago")).toBeInTheDocument();
    expect(within(paymentCard).getByText("constancia-pago.pdf")).toBeInTheDocument();
    expect(within(paymentCard).getByRole("link", { name: "Ver constancia" })).toHaveAttribute("href", "https://drive.example/payment-proof");
    expect(screen.queryByTestId("original-advance-payment-context")).not.toBeInTheDocument();
  });

  it("muestra estado no clicable cuando la constancia propia no tiene URL segura", () => {
    mocks.useRequest.mockReturnValue({
      request: makeRequest({
        id: "advance-1",
        request_code: "SOL-ORIG-1",
        request_type: REQUEST_TYPE.ADVANCE,
        status: REQUEST_STATUS.PAID,
        payment: {
          id: "payment-1",
          payment_request_id: "advance-1",
          paid_at: "2026-06-01T10:00:00.000Z",
          operation_reference: "OP-123",
          amount_paid: 100,
          bank_commission: null,
          notes: null,
          proof_document_id: "payment-proof-1",
          proofDocument: makeDocument({ id: "payment-proof-1", document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF, drive_web_url: null }),
          registered_by_id: "giof-1",
          created_at: "2026-06-01T10:00:00.000Z",
          updated_at: "2026-06-01T10:00:00.000Z",
          proof_entries: [],
        },
      }),
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: mocks.requestRefetch,
      patchRequest: vi.fn(),
    });

    render(<RequestDetailPage />);

    const paymentCard = screen.getByTestId("request-payment-proof-card");
    expect(within(paymentCard).getByText("Enlace no disponible")).toBeInTheDocument();
    expect(within(paymentCard).queryByRole("link", { name: "Ver constancia" })).not.toBeInTheDocument();
  });

  it("muestra Anticipo original en REXAN sin mezclar la constancia original como pago propio", () => {
    const ownProof = makeDocument({
      id: "rexan-proof-1",
      payment_request_id: "rexan-1",
      document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
      original_filename: "constancia-rexan.pdf",
      safe_filename: "constancia-rexan.pdf",
      drive_web_url: "https://drive.example/rexan-proof",
    });
    mocks.useRequest.mockReturnValue({
      request: makeRequest({
        status: REQUEST_STATUS.PAID,
        rexan_outcome: REXAN_OUTCOME.EXCESS,
        rexan_balance_amount: 25,
        payment: {
          id: "rexan-payment-1",
          payment_request_id: "rexan-1",
          paid_at: "2026-06-05T10:00:00.000Z",
          operation_reference: "OP-REXAN",
          amount_paid: 25,
          bank_commission: null,
          notes: null,
          proof_document_id: "rexan-proof-1",
          proofDocument: ownProof,
          registered_by_id: "giof-1",
          created_at: "2026-06-05T10:00:00.000Z",
          updated_at: "2026-06-05T10:00:00.000Z",
          proof_entries: [],
        },
      }),
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: mocks.requestRefetch,
      patchRequest: vi.fn(),
    });
    mocks.useSettlementContext.mockReturnValue({ context: makeSettlementContext(), isLoading: false, error: null, refetch: mocks.settlementContextRefetch });

    render(<RequestDetailPage />);

    const originalContext = screen.getByTestId("original-advance-payment-context");
    expect(within(originalContext).getByText("Anticipo original")).toBeInTheDocument();
    expect(within(originalContext).getByRole("button", { name: "Ver solicitud original" })).toBeInTheDocument();
    expect(within(originalContext).getByRole("link", { name: "Ver constancia original" })).toHaveAttribute("href", "https://drive.example/original-proof");
    const paymentCard = screen.getByTestId("request-payment-proof-card");
    expect(within(paymentCard).getByText("constancia-rexan.pdf")).toBeInTheDocument();
    expect(within(paymentCard).queryByText("constancia-original.pdf")).not.toBeInTheDocument();
  });

  it("mantiene Ver solicitud original y no renderiza enlace roto cuando la constancia original no tiene URL usable", () => {
    mocks.useRequest.mockReturnValue({
      request: makeRequest({ status: REQUEST_STATUS.PAID }),
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: mocks.requestRefetch,
      patchRequest: vi.fn(),
    });
    mocks.useSettlementContext.mockReturnValue({
      context: makeSettlementContext({
        payment: {
          id: "original-payment-1",
          paid_at: "2026-06-01T10:00:00.000Z",
          amount_paid: 100,
          proof_document_id: "original-proof-no-url",
          proof_pending: false,
          details_pending: false,
          operation_reference: "OP-ORIGINAL",
          proof_document: makeDocument({
            id: "original-proof-no-url",
            payment_request_id: "advance-1",
            document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
            original_filename: "constancia-original-sin-url.pdf",
            safe_filename: "constancia-original-sin-url.pdf",
            drive_web_url: null,
          }),
        },
      }),
      isLoading: false,
      error: null,
      refetch: mocks.settlementContextRefetch,
    });

    render(<RequestDetailPage />);

    const originalContext = screen.getByTestId("original-advance-payment-context");
    expect(within(originalContext).getByRole("button", { name: "Ver solicitud original" })).toBeInTheDocument();
    expect(within(originalContext).getByText("constancia-original-sin-url.pdf", { exact: false })).toBeInTheDocument();
    expect(within(originalContext).getByText("Constancia original no disponible")).toBeInTheDocument();
    expect(within(originalContext).queryByRole("link", { name: "Ver constancia original" })).not.toBeInTheDocument();
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
      patchRequest: vi.fn(),
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
