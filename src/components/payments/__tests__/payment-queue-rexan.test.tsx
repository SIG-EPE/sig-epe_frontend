import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterPaymentModal } from "@/components/payments/register-payment-modal";
import { PaymentQueueTable } from "@/components/payments/payment-queue-table";
import { REQUEST_CURRENCY, REQUEST_STATUS, REQUEST_TYPE, REXAN_OUTCOME, type PaymentRequest } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  registerPayment: vi.fn(),
}));

vi.mock("@/hooks/use-requests", () => ({
  useRegisterPayment: () => ({ registerPayment: mocks.registerPayment, isLoading: false, error: null }),
}));

function makeRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "req-1",
    request_code: "SOL-1",
    sequential_number: null,
    request_type: REQUEST_TYPE.REIMBURSEMENT,
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

describe("REXAN payment queue and modal", () => {
  beforeEach(() => {
    mocks.registerPayment.mockResolvedValue(makeRequest());
  });

  it("muestra el saldo REXAN para EXCESS y el monto normal para otros pagos", () => {
    render(
      <PaymentQueueTable
        requests={[
          makeRequest({ id: "rexan", request_code: "REXAN-1", request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT, requested_amount: 100, rexan_outcome: REXAN_OUTCOME.EXCESS, rexan_balance_amount: "25.55" }),
          makeRequest({ id: "normal", request_code: "SOL-2", requested_amount: 80 }),
        ]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
      />,
    );

    const rows = screen.getAllByTestId("payment-queue-row");
    expect(within(rows[0]).getByText("REXAN-1")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/25\.55/)).toBeInTheDocument();
    expect(within(rows[0]).getByText("Saldo REXAN")).toBeInTheDocument();
    expect(within(rows[1]).getByText("SOL-2")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/80\.00/)).toBeInTheDocument();
    expect(within(rows[1]).queryByText("Saldo REXAN")).not.toBeInTheDocument();
  });

  it("permite seleccionar pagos pendientes para acción masiva", async () => {
    const user = userEvent.setup();
    const onToggleRequest = vi.fn();
    const onToggleAll = vi.fn();

    render(
      <PaymentQueueTable
        requests={[makeRequest({ id: "req-1", request_code: "SOL-1" }), makeRequest({ id: "req-2", request_code: "SOL-2" })]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        selectedRequestIds={["req-1"]}
        onToggleRequest={onToggleRequest}
        onToggleAll={onToggleAll}
      />,
    );

    const checkboxes = screen.getAllByTestId("payment-row-checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();

    await user.click(checkboxes[1]);
    expect(onToggleRequest).toHaveBeenCalledWith("req-2", true);

    await user.click(screen.getByTestId("payment-select-all-checkbox"));
    expect(onToggleAll).toHaveBeenCalledWith(true);
  });

  it("muestra badges pendientes y acción para completar datos sin editar monto", () => {
    const onCompletePaymentDetails = vi.fn();
    const paidRequest = makeRequest({
      id: "paid-1",
      request_code: "SOL-PAID",
      status: REQUEST_STATUS.PAID,
      payment_id: "payment-1",
      payment_proof_pending: true,
      payment_details_pending: true,
    });

    render(
      <PaymentQueueTable
        requests={[paidRequest]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        onCompletePaymentDetails={onCompletePaymentDetails}
      />,
    );

    expect(screen.getByText("Falta constancia")).toBeInTheDocument();
    expect(screen.getByText("Falta referencia")).toBeInTheDocument();
    screen.getByRole("button", { name: "Completar datos" }).click();
    expect(onCompletePaymentDetails).toHaveBeenCalledWith(paidRequest);
  });

  it("bloquea edición visual del monto EXCESS pero lo incluye al registrar pago", async () => {
    const user = userEvent.setup();
    const request = makeRequest({
      id: "rexan-excess",
      request_code: "REXAN-EXCESS",
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      requested_amount: 100,
      rexan_outcome: REXAN_OUTCOME.EXCESS,
      rexan_balance_amount: "25.55",
    });

    render(<RegisterPaymentModal request={request} open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

    const amountInput = screen.getByTestId("payment-amount-input");
    expect(amountInput).toHaveValue(25.55);
    expect(amountInput).toHaveAttribute("readonly");
    expect(amountInput).not.toBeDisabled();

    await user.type(screen.getByTestId("payment-reference-input"), "OP-12345");
    await user.upload(screen.getByTestId("payment-proof-input"), new File(["proof"], "constancia.pdf", { type: "application/pdf" }));
    await user.click(screen.getAllByRole("button", { name: "Registrar pago" }).at(-1)!);

    await waitFor(() => {
      expect(mocks.registerPayment).toHaveBeenCalledWith("rexan-excess", expect.objectContaining({
        operation_reference: "OP-12345",
        amount_paid: 25.55,
        proof: expect.any(File),
      }));
    });
  });
});
