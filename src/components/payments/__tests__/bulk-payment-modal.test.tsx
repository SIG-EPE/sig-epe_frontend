import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BulkMarkPaidModal } from "@/components/payments/bulk-mark-paid-modal";
import { CompletePaymentDetailsModal } from "@/components/payments/complete-payment-details-modal";
import {
  REQUEST_CURRENCY,
  REQUEST_STATUS,
  REQUEST_TYPE,
  type PaymentRequest,
} from "@/types/requests";

const mocks = vi.hoisted(() => ({
  bulkMarkPaid: vi.fn(),
  completePaymentDetails: vi.fn(),
  retryRexanActivation: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/hooks/use-requests", () => ({
  useBulkMarkPaid: () => ({
    bulkMarkPaid: mocks.bulkMarkPaid,
    isLoading: false,
    error: null,
  }),
  useCompletePaymentDetails: () => ({
    completePaymentDetails: mocks.completePaymentDetails,
    isLoading: false,
    error: null,
  }),
  useRetryRexanActivation: () => ({
    retryRexanActivation: mocks.retryRexanActivation,
    isLoading: false,
    error: null,
  }),
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

  it("deshabilita el pago masivo porque el destino diario exige cuenta por solicitud", () => {
    render(
      <BulkMarkPaidModal
        requests={[
          makeRequest({ id: "req-1" }),
          makeRequest({ id: "req-2", requested_amount: 50 }),
        ]}
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByText(/pago masivo está deshabilitado con destinos diarios/i)).toBeInTheDocument();
    expect(screen.getByTestId("bulk-payment-paid-at-input")).toBeDisabled();
    expect(screen.getByTestId("bulk-payment-reference-input")).toBeDisabled();
    expect(screen.getByTestId("bulk-payment-notes-input")).toBeDisabled();
    const submitButton = screen.getByRole("button", { name: "Pago masivo no disponible" });
    expect(submitButton).toBeDisabled();
    fireEvent.submit(submitButton.closest("form") as HTMLFormElement);
    expect(mocks.bulkMarkPaid).not.toHaveBeenCalled();
  });

  it("completa datos por multipart sin exponer monto ni fecha", async () => {
    const user = userEvent.setup();
    mocks.completePaymentDetails.mockResolvedValueOnce({ id: "payment-1" });

    render(
      <CompletePaymentDetailsModal
        request={makeRequest({
          status: REQUEST_STATUS.PAID,
          payment_id: "payment-1",
        })}
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/no cambia el monto ni la fecha de pago/),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("payment-amount-input"),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByTestId("complete-payment-reference-input"),
      "OP-456",
    );
    await user.upload(
      screen.getByTestId("complete-payment-proof-input"),
      new File(["proof"], "constancia.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "Completar pago" }));

    await waitFor(() =>
      expect(mocks.completePaymentDetails).toHaveBeenCalledWith(
        "payment-1",
        expect.objectContaining({
          operation_reference: "OP-456",
          proof: expect.any(File),
        }),
      ),
    );
    expect(
      mocks.completePaymentDetails.mock.calls[0][1].bank_commission,
    ).toBeUndefined();
  });

  it("mantiene chrome fijo, un solo scroll interno, foco y error asociado en Completar pago", async () => {
    const allocations = Array.from({ length: 12 }, (_, index) => ({
      id: `allocation-${index + 1}`,
      payment_request_id: "req-1",
      budget_planning_line_id: `line-${index + 1}`,
      amount: 10,
      currency: REQUEST_CURRENCY.PEN,
      budget_month: 1,
      fiscal_year: 2026,
      org_unit_id: "org-1",
      sort_order: index,
      budgetPlanningLine: null,
      planning_line: null,
      org_unit: { id: "org-1", name: "Unidad 1" },
      payment_execution: null,
    }));
    render(
      <CompletePaymentDetailsModal
        request={makeRequest({
          status: REQUEST_STATUS.PAID,
          payment_id: "payment-1",
          allocations,
          allocation_count: allocations.length,
        })}
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Completar pago",
    });
    const initialInput = screen.getByTestId("complete-payment-reference-input");
    const proofInput = screen.getByTestId("complete-payment-proof-input");
    await waitFor(() => expect(document.activeElement).toBe(initialInput));
    expect(dialog.querySelectorAll(".overflow-y-auto")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Completar pago" }).parentElement).toHaveClass("shrink-0");
    expect(screen.getByRole("button", { name: "Completar pago" }).parentElement).toHaveClass("shrink-0");

    fireEvent.change(proofInput, {
      target: {
        files: [new File(["invalid"], "constancia.txt", { type: "text/plain" })],
      },
    });
    await waitFor(() =>
      expect(proofInput).toHaveAttribute(
        "aria-describedby",
        "complete-payment-proof-error",
      ),
    );
    expect(document.getElementById("complete-payment-proof-error")).toHaveTextContent(/formato/i);
  });
});
