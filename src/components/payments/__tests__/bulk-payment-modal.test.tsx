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
  uploadDocument: vi.fn(),
  retryRexanActivation: vi.fn(),
  push: vi.fn(),
}));

const LEASE_1 = "00000000-0000-4000-8000-000000000011";
const LEASE_2 = "00000000-0000-4000-8000-000000000012";

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
  useUploadRequestDocument: () => ({
    uploadDocument: mocks.uploadDocument,
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

function makeIncompletePaidRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return makeRequest({
    status: REQUEST_STATUS.PAID,
    paid_at: "2026-08-28T10:00:00-05:00",
    amount_disbursed: 100,
    payment_id: "payment-1",
    payment: {
      id: "payment-1",
      payment_request_id: "req-1",
      paid_at: "2026-08-28T10:00:00-05:00",
      operation_reference: null,
      amount_paid: 100,
      bank_commission: null,
      notes: null,
      source_account_key: "BCP_PEN",
      drive_projection_status: "PENDING",
      proof_document_id: null,
      proof_pending: true,
      details_pending: true,
      missing_fields: ["operation_reference", "proof"],
      completeness: "BOTH_PENDING",
      registered_by_id: "user-1",
      created_at: "2026-08-28T10:00:00-05:00",
      updated_at: "2026-08-28T10:00:00-05:00",
    },
    ...overrides,
  });
}

describe("bulk payment modals", () => {
  beforeEach(() => {
    mocks.bulkMarkPaid.mockReset();
    mocks.completePaymentDetails.mockReset();
    mocks.uploadDocument.mockReset();
    mocks.push.mockReset();
  });

  it("muestra preview, exige fecha/cuenta y envía referencia por solicitud", async () => {
    const user = userEvent.setup();
    mocks.bulkMarkPaid.mockResolvedValueOnce({
      batch_id: "batch-1", item_count: 2, success_count: 2, failed_count: 0,
      total_amount: 150, results: [
        { request_id: "req-1", status: "SUCCESS" },
        { request_id: "req-2", status: "ALREADY_PROCESSED" },
      ], rexan_metrics: {},
    });
    render(
      <BulkMarkPaidModal
        requests={[
          makeRequest({ id: "req-1" }),
          makeRequest({ id: "req-2", requested_amount: 50 }),
        ]}
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
        prepareItems={async () => [
          { request_id: "req-1", assignment_version: 1, lease_token: LEASE_1 },
          { request_id: "req-2", assignment_version: 2, lease_token: LEASE_2 },
        ]}
      />,
    );

    expect(screen.getAllByText("SOL-1")).toHaveLength(2);
    expect(screen.getAllByTestId("bulk-payment-reference-input")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Registrar 2 pagos" }));
    expect(await screen.findByText(/selecciona la cuenta de origen/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByTestId("bulk-payment-source-account-select"), "BCP_PEN");
    await user.type(screen.getAllByTestId("bulk-payment-reference-input")[0], "OP-UNO");
    await user.click(screen.getByRole("button", { name: "Registrar 2 pagos" }));

    await waitFor(() => expect(mocks.bulkMarkPaid).toHaveBeenCalledWith(expect.objectContaining({
      source_account_key: "BCP_PEN",
      items: [
        expect.objectContaining({ request_id: "req-1", operation_reference: "OP-UNO" }),
        expect.objectContaining({ request_id: "req-2", operation_reference: undefined }),
      ],
    })));
    expect(screen.getByText("Procesado correctamente")).toBeInTheDocument();
    expect(screen.getByText("Ya estaba procesado")).toBeInTheDocument();
  });

  it("conserva resultados y reintenta únicamente fallidos con una nueva intención estable", async () => {
    const user = userEvent.setup();
    mocks.bulkMarkPaid
      .mockResolvedValueOnce({ batch_id: "batch-1", item_count: 2, success_count: 1, failed_count: 1, total_amount: 100, rexan_metrics: {}, results: [
        { request_id: "req-1", status: "SUCCESS" },
        { request_id: "req-2", status: "FAILED", error_code: "ASSIGNMENT_VERSION_STALE", error: "La asignación cambió." },
      ] })
      .mockResolvedValueOnce({ batch_id: "batch-2", item_count: 1, success_count: 1, failed_count: 0, total_amount: 50, rexan_metrics: {}, results: [
        { request_id: "req-2", status: "SUCCESS" },
      ] });
    const prepareItems = vi.fn(async (requests: PaymentRequest[]) => requests.map((request, index) => ({
      request_id: request.id, assignment_version: index + 1, lease_token: index === 0 ? LEASE_1 : LEASE_2,
    })));
    render(<BulkMarkPaidModal requests={[makeRequest({ id: "req-1" }), makeRequest({ id: "req-2", request_code: "SOL-2" })]} open onOpenChange={vi.fn()} onSuccess={vi.fn()} prepareItems={prepareItems} />);
    await user.selectOptions(screen.getByTestId("bulk-payment-source-account-select"), "BCP_PEN");
    await user.click(screen.getByRole("button", { name: "Registrar 2 pagos" }));
    expect(await screen.findByText("La asignación cambió.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar 1 fallido" }));
    await waitFor(() => expect(mocks.bulkMarkPaid).toHaveBeenCalledTimes(2));
    expect(mocks.bulkMarkPaid.mock.calls[1][0].items).toHaveLength(1);
    expect(mocks.bulkMarkPaid.mock.calls[1][0].items[0].request_id).toBe("req-2");
    expect(mocks.bulkMarkPaid.mock.calls[1][0].client_batch_id).not.toBe(mocks.bulkMarkPaid.mock.calls[0][0].client_batch_id);
    expect(screen.getAllByText("Procesado correctamente")).toHaveLength(2);
  });

  it("mantiene client_batch_id al reintentar la misma intención tras un error de transporte", async () => {
    const user = userEvent.setup();
    mocks.bulkMarkPaid.mockRejectedValueOnce(new Error("No se pudo conectar")).mockResolvedValueOnce({
      batch_id: "batch-1", item_count: 1, success_count: 1, failed_count: 0,
      total_amount: 100, results: [{ request_id: "req-1", status: "SUCCESS" }], rexan_metrics: {},
    });
    render(<BulkMarkPaidModal requests={[makeRequest()]} open onOpenChange={vi.fn()} onSuccess={vi.fn()} prepareItems={async () => [{ request_id: "req-1", assignment_version: 1, lease_token: LEASE_1 }]} />);
    await user.selectOptions(screen.getByTestId("bulk-payment-source-account-select"), "BCP_PEN");
    await user.click(screen.getByRole("button", { name: "Registrar 1 pago" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar");
    await user.click(screen.getByRole("button", { name: "Registrar 1 pago" }));
    await waitFor(() => expect(mocks.bulkMarkPaid).toHaveBeenCalledTimes(2));
    expect(mocks.bulkMarkPaid.mock.calls[1][0].client_batch_id).toBe(mocks.bulkMarkPaid.mock.calls[0][0].client_batch_id);
  });

  it("sube constancia y completa por PATCH sin exponer monto ni fecha", async () => {
    const user = userEvent.setup();
    mocks.completePaymentDetails.mockResolvedValueOnce({ id: "payment-1" });
    mocks.uploadDocument.mockResolvedValueOnce({ id: "proof-document-1" });

    render(
      <CompletePaymentDetailsModal
        request={makeIncompletePaidRequest()}
        open
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/fecha, cuenta y monto no se modificarán/),
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
          proof_document_id: "proof-document-1",
        }),
      ),
    );
    expect(mocks.uploadDocument).toHaveBeenCalledBefore(mocks.completePaymentDetails);
    expect(mocks.completePaymentDetails.mock.calls[0][1].bank_commission).toBeUndefined();
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
        request={makeIncompletePaidRequest({
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
