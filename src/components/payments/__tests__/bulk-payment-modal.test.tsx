import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BulkMarkPaidModal } from "@/components/payments/bulk-mark-paid-modal";
import { CompletePaymentDetailsModal } from "@/components/payments/complete-payment-details-modal";
import { REQUEST_CURRENCY, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  bulkMarkPaid: vi.fn(),
  completePaymentDetails: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/hooks/use-requests", () => ({
  useBulkMarkPaid: () => ({ bulkMarkPaid: mocks.bulkMarkPaid, isLoading: false, error: null }),
  useCompletePaymentDetails: () => ({ completePaymentDetails: mocks.completePaymentDetails, isLoading: false, error: null }),
}));

function makeRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "req-1",
    request_code: "SOL-1",
    sequential_number: null,
    request_type: REQUEST_TYPE.ADVANCE,
    status: REQUEST_STATUS.APPROVED,
    fiscal_year: 2026,
    requested_amount: 100,
    currency: REQUEST_CURRENCY.PEN,
    concept: "Solicitud de prueba",
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
    submitted_at: null,
    observed_at: null,
    approved_at: "2026-05-01T10:00:00.000Z",
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

describe("bulk payment modals", () => {
  beforeEach(() => {
    mocks.bulkMarkPaid.mockReset();
    mocks.completePaymentDetails.mockReset();
    mocks.push.mockReset();
  });

  it("envía payload masivo sin monto y muestra resumen con pendientes, correo y REXAN", async () => {
    const user = userEvent.setup();
    mocks.bulkMarkPaid.mockResolvedValueOnce({
      batch_id: "batch-1",
      item_count: 2,
      success_count: 1,
      failed_count: 1,
      total_amount: 100,
      results: [
        { request_id: "req-1", status: "success", payment_id: "payment-1", proof_pending: true, details_pending: true, email_status: "queued", rexan: { status: "CREATED", settlement_request_id: "rexan-1" } },
        { request_id: "req-2", status: "failed", error: "Solicitud no elegible" },
      ],
    });

    render(
      <BulkMarkPaidModal
        requests={[makeRequest({ id: "req-1" }), makeRequest({ id: "req-2", requested_amount: 50 })]}
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await user.clear(screen.getByTestId("bulk-payment-paid-at-input"));
    await user.type(screen.getByTestId("bulk-payment-paid-at-input"), "2026-05-30T09:30");
    await user.type(screen.getByTestId("bulk-payment-reference-input"), "OP-123");
    await user.type(screen.getByTestId("bulk-payment-notes-input"), "Lote banco");
    await user.click(screen.getByRole("button", { name: "Marcar como pagadas" }));

    await waitFor(() => expect(mocks.bulkMarkPaid).toHaveBeenCalled());
    expect(mocks.bulkMarkPaid).toHaveBeenCalledWith(expect.objectContaining({
      request_ids: ["req-1", "req-2"],
      operation_reference: "OP-123",
      notes: "Lote banco",
    }));
    expect(mocks.bulkMarkPaid.mock.calls[0][0]).not.toHaveProperty("amount_paid");

    const summary = await screen.findByTestId("bulk-payment-result-summary");
    expect(within(summary).queryByText(/Lote:/)).not.toBeInTheDocument();
    expect(within(summary).getByText("Falta constancia")).toBeInTheDocument();
    expect(within(summary).getByText("Falta referencia")).toBeInTheDocument();
    expect(within(summary).getByText("Correo en cola")).toBeInTheDocument();
    expect(within(summary).getByText("REXAN activada")).toBeInTheDocument();
    expect(mocks.push).toHaveBeenCalledWith("/requests/rexan-1");
  });

  it("completa datos por multipart sin exponer monto ni fecha", async () => {
    const user = userEvent.setup();
    mocks.completePaymentDetails.mockResolvedValueOnce({ id: "payment-1" });

    render(
      <CompletePaymentDetailsModal
        request={makeRequest({ status: REQUEST_STATUS.PAID, payment_id: "payment-1" })}
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByText(/El monto y la fecha de pago no se modifican/)).toBeInTheDocument();
    expect(screen.queryByTestId("payment-amount-input")).not.toBeInTheDocument();

    await user.type(screen.getByTestId("complete-payment-reference-input"), "OP-456");
    await user.upload(screen.getByTestId("complete-payment-proof-input"), new File(["proof"], "constancia.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: "Completar datos" }));

    await waitFor(() => expect(mocks.completePaymentDetails).toHaveBeenCalledWith("payment-1", expect.objectContaining({
      operation_reference: "OP-456",
      proof: expect.any(File),
    })));
    expect(mocks.completePaymentDetails.mock.calls[0][1].bank_commission).toBeUndefined();
  });
});
