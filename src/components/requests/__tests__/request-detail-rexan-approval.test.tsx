import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequestDetailPage } from "@/components/requests/request-detail-page";
import { REQUEST_CURRENCY, REQUEST_DOCUMENT_CATEGORY, REQUEST_DOCUMENT_STORAGE_PROVIDER, REQUEST_DOCUMENT_UPLOAD_STATUS, REQUEST_STATUS, REQUEST_TYPE, REXAN_OUTCOME, type PaymentRequest, type RequestDocument } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  approveRequest: vi.fn(),
  observeRequest: vi.fn(),
  rejectRequest: vi.fn(),
  startAdvanceSettlement: vi.fn(),
  useRequest: vi.fn(),
  useRequestDocuments: vi.fn(),
  requestRefetch: vi.fn(),
  documentsRefetch: vi.fn(),
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
    created_at: "2026-05-01T10:00:00.000Z",
    ...overrides,
  };
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
  });

  it("aprueba REXAN EXACT con validated_spent_amount y sin campos de devolución ni nota legacy", async () => {
    const user = await openApproveDialogAndSetAmount("100");

    expect(screen.getByText("Monto del anticipo")).toBeInTheDocument();
    expect(screen.getByText("Regla: se compara el gasto validado contra el monto del anticipo. Si es igual, la rendición se aprueba sin saldo; si es menor, se registra devolución; si es mayor, el saldo adicional pasa a Cola de Pagos.")).toBeInTheDocument();
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

  it("bloquea DEVOLUCION sin constancia y muestra una indicación accionable", async () => {
    const user = await openApproveDialogAndSetAmount("80");

    expect(screen.getByText(/Devolución: se debe registrar constancia por S\/\s*20\.00\./)).toBeInTheDocument();
    expect(screen.getByText(/Obligatorio para devolución: selecciona una constancia RETURN_PROOF por S\/\s*20\.00 antes de aprobar\./)).toBeInTheDocument();
    expect(screen.getByText("Para aprobar una devolución, primero solicita o adjunta la constancia de devolución en PDF, JPG o PNG.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Aprobar rendición" }).at(-1)!);

    expect(mocks.approveRequest).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("Para aprobar una devolución, primero solicita o adjunta la constancia de devolución en PDF, JPG o PNG.");
  });

  it("envía la constancia RETURN_PROOF seleccionada para DEVOLUCION", async () => {
    mocks.useRequestDocuments.mockReturnValue({ documents: [makeDocument()], isLoading: false, error: null, refetch: mocks.documentsRefetch });
    const user = await openApproveDialogAndSetAmount("80");

    expect(screen.getByText(/Obligatorio para devolución: selecciona una constancia RETURN_PROOF por S\/\s*20\.00 antes de aprobar\./)).toBeInTheDocument();
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
