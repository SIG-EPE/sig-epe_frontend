import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompletePaymentDetailsModal } from "@/components/payments/complete-payment-details-modal";
import {
  DRIVE_SOURCE_ACCOUNT,
  REQUEST_CURRENCY,
  REQUEST_STATUS,
  REQUEST_TYPE,
  type PaymentRequest,
} from "@/types/requests";

const mocks = vi.hoisted(() => ({ complete: vi.fn() }));

vi.mock("@/hooks/use-requests", () => ({
  useCompletePaymentDetails: () => ({
    completePaymentDetails: mocks.complete,
    isLoading: false,
    error: null,
  }),
}));

function request(): PaymentRequest {
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
      operation_reference: null,
      amount_paid: 100,
      drive_route_model: "DAILY_V1",
      drive_routing_date: "2026-05-14",
      drive_route_cutover_at: "2026-05-01T00:00:00.000Z",
      bank_commission: null,
      notes: null,
      source_account_key: null,
      payment_cycle_kind: "ADVANCE_OR_REIMBURSEMENT",
      payment_cycle_date: "2026-05-19",
      desired_parent_logical_key: null,
      drive_projection_version: 1,
      drive_projection_status: "SOURCE_REQUIRED",
      proof_document_id: null,
      proof_pending: true,
      details_pending: true,
      registered_by_id: "user-1",
      created_at: "2026-05-14T15:30:00.000Z",
      updated_at: "2026-05-14T15:30:00.000Z",
    },
  };
}

interface MissingPaymentData {
  source: boolean;
  reference: boolean;
  proof: boolean;
}

function requestWithMissing({ source, reference, proof }: MissingPaymentData): PaymentRequest {
  const paymentRequest = request();
  const payment = paymentRequest.payment!;
  payment.drive_projection_status = source ? "SOURCE_REQUIRED" : "PENDING";
  payment.source_account_key = source ? null : DRIVE_SOURCE_ACCOUNT.BCP_PEN;
  payment.operation_reference = reference ? null : "OP-123";
  payment.proof_document_id = proof ? null : "proof-1";
  payment.proof_pending = proof;
  payment.details_pending = source || reference;
  return paymentRequest;
}

describe("CompletePaymentDetailsModal", () => {
  beforeEach(() => mocks.complete.mockReset());

  it("renders canonical payment values as an exact, compact read-only summary", () => {
    render(
      <CompletePaymentDetailsModal
        request={request()}
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Completar pago" })).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Resumen del pago" });
    expect(within(summary).getByText("Fecha de pago")).toBeInTheDocument();
    expect(within(summary).getByText("Monto")).toBeInTheDocument();
    expect(within(summary).getByText("Cuenta origen")).toBeInTheDocument();
    expect(within(summary).getByText("Pendiente")).toBeInTheDocument();
    expect(within(summary).getByText("Fecha de destino")).toBeInTheDocument();
    expect(within(summary).getByText("14 de mayo de 2026")).toBeInTheDocument();
    expect(summary).not.toHaveTextContent(/ciclo asignado/i);
    expect(summary.querySelector("input, select, textarea")).toBeNull();
    expect(summary).not.toHaveTextContent(/constancia/i);
    expect(screen.getByLabelText("Cuenta de origen Enseña Perú")).toBeRequired();
    expect(screen.getByLabelText(/Referencia de operación/)).toBeRequired();
    expect(screen.getByLabelText(/Constancia de pago/)).toBeRequired();
  });

  it("does not present a destination when the V2 route is unavailable", () => {
    const unavailableRequest = request();
    unavailableRequest.payment!.drive_route_model = null;
    unavailableRequest.payment!.drive_routing_date = null;

    render(<CompletePaymentDetailsModal request={unavailableRequest} open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

    const summary = screen.getByRole("region", { name: "Resumen del pago" });
    expect(within(summary).getByText("Ruta V2 no disponible")).toBeInTheDocument();
    expect(within(summary).queryByText("Fecha de destino")).not.toBeInTheDocument();
  });

  it.each([
    {
      name: "source, reference, and proof",
      missing: { source: true, reference: true, proof: true },
      targetLabel: "Cuenta de origen Enseña Perú" as const,
    },
    {
      name: "source and reference",
      missing: { source: true, reference: true, proof: false },
      targetLabel: "Cuenta de origen Enseña Perú" as const,
    },
    {
      name: "source and proof",
      missing: { source: true, reference: false, proof: true },
      targetLabel: "Cuenta de origen Enseña Perú" as const,
    },
    {
      name: "source only",
      missing: { source: true, reference: false, proof: false },
      targetLabel: "Cuenta de origen Enseña Perú" as const,
    },
    {
      name: "reference and proof",
      missing: { source: false, reference: true, proof: true },
      targetLabel: /Referencia de operación/,
    },
    {
      name: "reference only",
      missing: { source: false, reference: true, proof: false },
      targetLabel: /Referencia de operación/,
    },
    {
      name: "proof only",
      missing: { source: false, reference: false, proof: true },
      targetLabel: /Constancia de pago/,
    },
  ])("renders only $name controls and focuses the first missing action", async ({ missing, targetLabel }) => {
    render(
      <CompletePaymentDetailsModal
        request={requestWithMissing(missing)}
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(Boolean(screen.queryByLabelText("Cuenta de origen Enseña Perú"))).toBe(missing.source);
    expect(Boolean(screen.queryByLabelText(/Referencia de operación/))).toBe(missing.reference);
    expect(Boolean(screen.queryByLabelText(/Constancia de pago/))).toBe(missing.proof);
    await waitFor(() => expect(screen.getByLabelText(targetLabel)).toHaveFocus());
  });

  it("shows the resolved source in the summary and no required controls when nothing is missing", () => {
    render(
      <CompletePaymentDetailsModal
        request={requestWithMissing({ source: false, reference: false, proof: false })}
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const summary = screen.getByRole("region", { name: "Resumen del pago" });
    expect(within(summary).getByText("BCP-SOLES")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cuenta de origen Enseña Perú")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Referencia de operación/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Constancia de pago/)).not.toBeInTheDocument();
  });

  it("announces all conditional errors and submits only completion fields", async () => {
    const user = userEvent.setup();
    mocks.complete.mockResolvedValueOnce({ id: "request-1" });
    render(
      <CompletePaymentDetailsModal
        request={request()}
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Completar pago" }));
    expect(await screen.findByText("Selecciona la cuenta de origen.")).toBeInTheDocument();
    expect(screen.getByText("Ingresa la referencia de operación.")).toBeInTheDocument();
    expect(screen.getByText("Adjunta la constancia global de pago.")).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText("Cuenta de origen Enseña Perú"),
      DRIVE_SOURCE_ACCOUNT.BCP_PEN,
    );
    await user.type(screen.getByLabelText(/Referencia de operación/), "OP-123");
    await user.upload(
      screen.getByLabelText(/Constancia de pago/),
      new File(["proof"], "proof.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "Completar pago" }));

    await waitFor(() => expect(mocks.complete).toHaveBeenCalled());
    const payload = mocks.complete.mock.calls[0][1];
    expect(payload).toMatchObject({
      source_account_key: DRIVE_SOURCE_ACCOUNT.BCP_PEN,
      operation_reference: "OP-123",
      proof: expect.any(File),
    });
    expect(payload).not.toHaveProperty("paid_at");
    expect(payload).not.toHaveProperty("amount_paid");
  });
});
