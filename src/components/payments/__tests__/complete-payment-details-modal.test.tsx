import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompletePaymentDetailsModal } from "@/components/payments/complete-payment-details-modal";
import {
  PAYMENT_COMPLETENESS_STATE,
  REQUEST_CURRENCY,
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_DOCUMENT_STORAGE_PROVIDER,
  REQUEST_DOCUMENT_UPLOAD_STATUS,
  REQUEST_STATUS,
  REQUEST_TYPE,
  type PaymentCompletenessState,
  type PaymentRequest,
  type RequestDocument,
} from "@/types/requests";

const mocks = vi.hoisted(() => ({ complete: vi.fn(), upload: vi.fn() }));

vi.mock("@/hooks/use-requests", () => ({
  useCompletePaymentDetails: () => ({
    completePaymentDetails: mocks.complete,
    isLoading: false,
    error: null,
  }),
  useUploadRequestDocument: () => ({
    uploadDocument: mocks.upload,
    isLoading: false,
    error: null,
  }),
}));

function uploadedDocument(): RequestDocument {
  return {
    id: "proof-document-1",
    payment_request_id: "request-1",
    document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
    safe_filename: "constancia.pdf",
    original_filename: "constancia.pdf",
    mime_type: "application/pdf",
    size_bytes: 5,
    storage_provider: REQUEST_DOCUMENT_STORAGE_PROVIDER.DRIVE,
    upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
    created_at: "2026-08-28T10:00:00.000Z",
  };
}

function request(completeness: PaymentCompletenessState): PaymentRequest {
  const referenceMissing = completeness === PAYMENT_COMPLETENESS_STATE.REFERENCE_PENDING
    || completeness === PAYMENT_COMPLETENESS_STATE.BOTH_PENDING;
  const proofMissing = completeness === PAYMENT_COMPLETENESS_STATE.PROOF_PENDING
    || completeness === PAYMENT_COMPLETENESS_STATE.BOTH_PENDING;
  return {
    id: "request-1",
    request_code: "SOL-1",
    sequential_number: null,
    request_type: REQUEST_TYPE.REIMBURSEMENT,
    status: REQUEST_STATUS.PAID,
    fiscal_year: 2026,
    requested_amount: 100,
    currency: REQUEST_CURRENCY.PEN,
    concept: "Prueba",
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
    beneficiary_name: "Persona",
    beneficiary_document_type: null,
    beneficiary_document_number: null,
    bank_code: null,
    bank_name: null,
    account_type: null,
    bank_account: null,
    bank_cci: null,
    submitted_at: null,
    observed_at: null,
    approved_at: "2026-05-01T10:00:00.000Z",
    rejected_at: null,
    paid_at: "2026-05-14T15:30:00.000Z",
    disbursed_at: null,
    amount_disbursed: 100,
    notes: null,
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-14T15:30:00.000Z",
    payment_id: "payment-1",
    payment: {
      id: "payment-1",
      payment_request_id: "request-1",
      paid_at: "2026-05-14T15:30:00.000Z",
      operation_reference: referenceMissing ? null : "OP-123",
      amount_paid: 100,
      bank_commission: null,
      notes: null,
      source_account_key: "BCP_PEN",
      drive_projection_status: "PENDING",
      proof_document_id: proofMissing ? null : "proof-1",
      proof_pending: proofMissing,
      details_pending: referenceMissing,
      missing_fields: [
        ...(referenceMissing ? ["operation_reference" as const] : []),
        ...(proofMissing ? ["proof" as const] : []),
      ],
      completeness,
      registered_by_id: "user-1",
      created_at: "2026-05-14T15:30:00.000Z",
      updated_at: "2026-05-14T15:30:00.000Z",
    },
  };
}

describe("CompletePaymentDetailsModal", () => {
  beforeEach(() => {
    mocks.complete.mockReset();
    mocks.upload.mockReset();
  });

  it.each([
    [PAYMENT_COMPLETENESS_STATE.REFERENCE_PENDING, true, false],
    [PAYMENT_COMPLETENESS_STATE.PROOF_PENDING, false, true],
    [PAYMENT_COMPLETENESS_STATE.BOTH_PENDING, true, true],
  ])("renders only missing fields for %s", (completeness, referenceMissing, proofMissing) => {
    render(<CompletePaymentDetailsModal request={request(completeness)} open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

    expect(Boolean(screen.queryByLabelText(/Referencia de operación/))).toBe(referenceMissing);
    expect(Boolean(screen.queryByLabelText(/Constancia de pago/))).toBe(proofMissing);
    expect(screen.queryByLabelText(/Cuenta de origen/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Comisión bancaria/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Notas/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^TC final/)).not.toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Resumen del pago" });
    expect(summary.querySelector("input, select, textarea")).toBeNull();
  });

  it("shows COMPLETE as read-only with no pending action", () => {
    render(<CompletePaymentDetailsModal request={request(PAYMENT_COMPLETENESS_STATE.COMPLETE)} open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByText("Este pago ya tiene referencia y constancia.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Completar pago" })).not.toBeInTheDocument();
  });

  it("uploads the proof first and PATCHes only reference/proof_document_id", async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    mocks.upload.mockImplementation(async () => { calls.push("upload"); return uploadedDocument(); });
    mocks.complete.mockImplementation(async () => { calls.push("patch"); return request(PAYMENT_COMPLETENESS_STATE.COMPLETE); });
    const onSuccess = vi.fn();
    render(<CompletePaymentDetailsModal request={request(PAYMENT_COMPLETENESS_STATE.BOTH_PENDING)} open onOpenChange={vi.fn()} onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/Referencia de operación/), " OP-456 ");
    await user.upload(screen.getByLabelText(/Constancia de pago/), new File(["proof"], "constancia.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Completar pago" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(["upload", "patch"]);
    expect(mocks.upload).toHaveBeenCalledWith("request-1", {
      file: expect.any(File),
      document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
    });
    expect(mocks.complete).toHaveBeenCalledWith("payment-1", expect.objectContaining({
      operation_reference: "OP-456",
      proof_document_id: "proof-document-1",
    }));
    const payload = mocks.complete.mock.calls[0][1];
    expect(payload).not.toHaveProperty("paid_at");
    expect(payload).not.toHaveProperty("amount_paid");
    expect(payload).not.toHaveProperty("source_account_key");
  });

  it("keeps the modal open and shows a sanitized upload or PATCH error", async () => {
    const user = userEvent.setup();
    mocks.upload.mockRejectedValueOnce(new Error("No se pudo cargar la constancia."));
    const onOpenChange = vi.fn();
    render(<CompletePaymentDetailsModal request={request(PAYMENT_COMPLETENESS_STATE.PROOF_PENDING)} open onOpenChange={onOpenChange} onSuccess={vi.fn()} />);

    await user.upload(screen.getByLabelText(/Constancia de pago/), new File(["proof"], "constancia.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Completar pago" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar la constancia.");
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("keeps the entered reference when PATCH fails", async () => {
    const user = userEvent.setup();
    mocks.complete.mockRejectedValueOnce(new Error("No se pudieron guardar los datos pendientes."));
    render(<CompletePaymentDetailsModal request={request(PAYMENT_COMPLETENESS_STATE.REFERENCE_PENDING)} open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

    const reference = screen.getByLabelText(/Referencia de operación/);
    await user.type(reference, "OP-ERROR");
    await user.click(screen.getByRole("button", { name: "Completar pago" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron guardar los datos pendientes.");
    expect(reference).toHaveValue("OP-ERROR");
  });

  it("requires manual USD FX alone without replacing existing evidence and previews half-up", async () => {
    const user = userEvent.setup();
    const row = request(PAYMENT_COMPLETENESS_STATE.COMPLETE);
    row.currency = "USD";
    row.payment!.amount_paid = 1;
    row.payment!.completeness = PAYMENT_COMPLETENESS_STATE.REFERENCE_PENDING;
    row.payment!.missing_fields = ["final_fx_rate", "final_fx_confirmed"];
    render(<CompletePaymentDetailsModal request={row} open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByLabelText(/Referencia de operación/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Completar pago" }));
    expect(mocks.complete).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/^TC final/), "3.805");
    expect(screen.getByText(/PEN 3.81/)).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Confirmo el TC/));
    await user.click(screen.getByRole("button", { name: "Completar pago" }));
    await waitFor(() => expect(mocks.complete).toHaveBeenCalledOnce());
    expect(mocks.complete.mock.calls[0][1]).toEqual(expect.objectContaining({ command_id: expect.any(String), final_fx_rate: "3.805", final_fx_confirmed: true }));
    expect(mocks.complete.mock.calls[0][1].operation_reference).toBeUndefined();
  });

  it("reuses uploaded proof and command on explicit retry, but blocks conflict replay", async () => {
    const user = userEvent.setup();
    mocks.upload.mockResolvedValue(uploadedDocument());
    mocks.complete.mockRejectedValueOnce(new Error("Respuesta perdida")).mockRejectedValueOnce({ statusCode: 409 });
    render(<CompletePaymentDetailsModal request={request(PAYMENT_COMPLETENESS_STATE.PROOF_PENDING)} open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);
    await user.upload(screen.getByLabelText(/Constancia de pago/), new File(["proof"], "constancia.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Completar pago" }));
    await screen.findByText("Respuesta perdida");
    await user.click(screen.getByRole("button", { name: "Completar pago" }));
    await waitFor(() => expect(mocks.complete).toHaveBeenCalledTimes(2));
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.complete.mock.calls[1][1]).toEqual(mocks.complete.mock.calls[0][1]);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Actualiza la cola/);
    expect(screen.getByRole("button", { name: "Completar pago" })).toBeDisabled();
  });

  it.each(["0", "-1", "3e2", "3.1234567890123"])("rejects invalid USD TC %s before uploads", async (rate) => {
    const user = userEvent.setup();
    const row = request(PAYMENT_COMPLETENESS_STATE.COMPLETE);
    row.currency = "USD";
    row.payment!.missing_fields = ["final_fx_rate", "final_fx_confirmed"];
    render(<CompletePaymentDetailsModal request={row} open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);
    await user.type(screen.getByLabelText(/^TC final/), rate);
    await user.click(screen.getByLabelText(/Confirmo el TC/));
    await user.click(screen.getByRole("button", { name: "Completar pago" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/TC positivo/);
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("keeps accepted final USD valuation read-only even if the budget is negative", () => {
    const row = request(PAYMENT_COMPLETENESS_STATE.COMPLETE);
    row.currency = "USD";
    row.payment!.valuation = { amount_pen: "380.50", accounting_currency: "PEN", state: "FINAL", reference: null, final_rate: "3.805", final_confirmed_at: "2026-09-10T10:00:00Z", final_confirmed_by: "u", origin_execution_id: null };
    render(<CompletePaymentDetailsModal request={row} open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByLabelText(/^TC final/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Completar pago" })).not.toBeInTheDocument();
    expect(screen.getByText(/TC final confirmado: 3.805/)).toBeInTheDocument();
  });
});
