import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterPaymentModal } from "@/components/payments/register-payment-modal";
import { AttachPaymentProofModal } from "@/components/payments/attach-payment-proof-modal";
import { PaymentQueuePage } from "@/components/payments/payment-queue-page";
import { PaymentQueueTable } from "@/components/payments/payment-queue-table";
import { REQUEST_CURRENCY, REQUEST_DOCUMENT_CATEGORY, REQUEST_DOCUMENT_STORAGE_PROVIDER, REQUEST_DOCUMENT_UPLOAD_STATUS, REQUEST_STATUS, REQUEST_TYPE, REXAN_OUTCOME, type PaymentRequest, type RequestAllocation } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  registerPayment: vi.fn(),
  attachPaymentProof: vi.fn(),
  usePaymentQueue: vi.fn(),
}));

vi.mock("@/hooks/use-requests", () => ({
  useRegisterPayment: () => ({ registerPayment: mocks.registerPayment, isLoading: false, error: null }),
  useAttachPaymentProof: () => ({ attachPaymentProof: mocks.attachPaymentProof, isLoading: false, error: null }),
  useBulkMarkPaid: () => ({ bulkMarkPaid: vi.fn(), isLoading: false, error: null }),
  useCompletePaymentDetails: () => ({ completePaymentDetails: vi.fn(), isLoading: false, error: null }),
  usePaymentQueue: mocks.usePaymentQueue,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function makeAllocation(overrides: Partial<RequestAllocation> = {}): RequestAllocation {
  return {
    id: "allocation-1",
    payment_request_id: "req-1",
    budget_planning_line_id: "line-1",
    amount: 60,
    currency: REQUEST_CURRENCY.PEN,
    budget_month: 1,
    fiscal_year: 2026,
    org_unit_id: "org-1",
    sort_order: 1,
    budgetPlanningLine: null,
    planning_line: {
      id: "line-1",
      line_code: "POA-001",
      resource_description: "Materiales educativos",
      total_cost: 100,
      status: "APPROVED",
      fiscal_year: { id: "fy-2026", year: 2026 },
      org_unit: { id: "org-1", name: "Unidad 1" },
      category: null,
      program: null,
      action: null,
      monthly_summary: [],
      funding_sources: [{ id: "funding-1", funding_source_id: "source-1", code: "FF-1", name: "Tesoro Público", allocated_amount: 60, percentage: 100 }],
    },
    org_unit: { id: "org-1", name: "Unidad 1" },
    financiers: [{ id: "funding-1", funding_source_id: "source-1", code: "FF-1", name: "Tesoro Público", allocated_amount: 60, percentage: 100 }],
    payment_execution: null,
    ...overrides,
  };
}

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
    vi.clearAllMocks();
    mocks.registerPayment.mockResolvedValue(makeRequest());
    mocks.attachPaymentProof.mockResolvedValue(makeRequest());
    mocks.usePaymentQueue.mockReturnValue({ requests: [], total: 0, isLoading: false, error: null, refetch: vi.fn() });
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

  it("explica que la constancia inicial cubre todas las líneas POA", () => {
    const request = makeRequest({
      id: "multi-allocation",
      request_code: "SOL-MULTI",
      allocation_count: 2,
      allocations: [
        makeAllocation(),
        makeAllocation({ id: "allocation-2", budget_planning_line_id: "line-2", amount: 40, sort_order: 2, planning_line: { ...makeAllocation().planning_line!, id: "line-2", line_code: "POA-002", resource_description: "Servicios logísticos" } }),
      ],
    });

    render(<RegisterPaymentModal request={request} open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByText("La constancia que adjuntes en este pago cubrirá todas las líneas POA de la solicitud.")).toBeInTheDocument();
    expect(screen.getAllByText("Se cubrirá con la constancia general")).toHaveLength(2);
    expect(screen.queryByText("Sin comprobante específico")).not.toBeInTheDocument();
  });

  it("muestra el desglose pendiente como vista previa del pago general", () => {
    const request = makeRequest({
      status: REQUEST_STATUS.APPROVED,
      allocation_count: 2,
      allocations: [
        makeAllocation(),
        makeAllocation({ id: "allocation-2", budget_planning_line_id: "line-2", amount: 40, sort_order: 2, planning_line: { ...makeAllocation().planning_line!, id: "line-2", line_code: "POA-002", resource_description: "Servicios logísticos" } }),
      ],
    });

    render(<PaymentQueueTable requests={[request]} isLoading={false} onRegisterPayment={vi.fn()} />);

    expect(screen.getByText("Desglose de líneas POA incluidas en el pago")).toBeInTheDocument();
    expect(screen.getByText("La constancia que adjuntes en este pago cubrirá todas las líneas POA de la solicitud.")).toBeInTheDocument();
    expect(screen.getAllByText("Se cubrirá con la constancia general")).toHaveLength(2);
    expect(screen.queryByText("Sin comprobante específico")).not.toBeInTheDocument();
    expect(screen.queryByText("Desglose de líneas POA y cobertura de comprobantes")).not.toBeInTheDocument();
  });

  it("muestra desglose de asignaciones y cobertura de comprobantes en la cola", () => {
    const request = makeRequest({
      status: REQUEST_STATUS.PAID,
      payment_id: "payment-1",
      allocation_count: 2,
      allocations: [
        makeAllocation(),
        makeAllocation({ id: "allocation-2", budget_planning_line_id: "line-2", amount: 40, sort_order: 2, planning_line: { ...makeAllocation().planning_line!, id: "line-2", line_code: "POA-002", resource_description: "Servicios logísticos" } }),
      ],
      payment: {
        id: "payment-1",
        payment_request_id: "req-1",
        paid_at: "2026-06-08T20:00:00.000Z",
        operation_reference: "OP-GENERAL",
        amount_paid: 100,
        bank_commission: null,
        notes: null,
        proof_document_id: "proof-doc-1",
        proofDocument: null,
        registered_by_id: "user-1",
        created_at: "2026-06-08T20:00:00.000Z",
        updated_at: "2026-06-08T20:00:00.000Z",
        proof_entries: [{
          id: "proof-entry-1",
          request_payment_id: "payment-1",
          proof_document_id: "proof-doc-1",
          proof_document: {
            id: "proof-doc-1",
            payment_request_id: "req-1",
            document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
            safe_filename: "constancia.pdf",
            original_filename: "constancia.pdf",
            mime_type: "application/pdf",
            size_bytes: 10,
            storage_provider: REQUEST_DOCUMENT_STORAGE_PROVIDER.LOCAL,
            upload_status: REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT,
            created_at: "2026-06-08T20:00:00.000Z",
          },
          operation_reference: "OP-LINEA-1",
          paid_at: "2026-06-08T20:00:00.000Z",
          amount_paid: 60,
          notes: null,
          allocations: [{ id: "coverage-1", request_payment_proof_id: "proof-entry-1", request_allocation_id: "allocation-1", amount_covered: 60 }],
          created_at: "2026-06-08T20:00:00.000Z",
          updated_at: "2026-06-08T20:00:00.000Z",
        }],
      },
    });

    render(<PaymentQueueTable requests={[request]} isLoading={false} onRegisterPayment={vi.fn()} onAttachPaymentProof={vi.fn()} />);

    expect(screen.getByText("Desglose de líneas POA y cobertura de comprobantes")).toBeInTheDocument();
    expect(screen.getByText("El pago es de la solicitud completa; estos comprobantes respaldan líneas POA específicas.")).toBeInTheDocument();
    expect(screen.getByText(/POA-001/)).toBeInTheDocument();
    expect(screen.getAllByText(/Tesoro Público/)).toHaveLength(2);
    expect(screen.getByText("Con comprobante asociado")).toBeInTheDocument();
    expect(screen.getByText("Sin comprobante específico")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar comprobante POA" })).toBeInTheDocument();
  });

  it("asocia comprobante adicional con ids de asignación seleccionados", async () => {
    const user = userEvent.setup();
    const request = makeRequest({
      status: REQUEST_STATUS.PAID,
      payment_id: "payment-1",
      allocations: [makeAllocation()],
      payment: {
        id: "payment-1",
        payment_request_id: "req-1",
        paid_at: "2026-06-08T20:00:00.000Z",
        operation_reference: null,
        amount_paid: 100,
        bank_commission: null,
        notes: null,
        proof_document_id: null,
        proofDocument: null,
        registered_by_id: "user-1",
        created_at: "2026-06-08T20:00:00.000Z",
        updated_at: "2026-06-08T20:00:00.000Z",
        proof_entries: [],
      },
    });

    render(<AttachPaymentProofModal request={request} open onOpenChange={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByTestId("attach-proof-allocation-checkbox"));
    await user.type(screen.getByTestId("attach-payment-reference-input"), "OP-POA-1");
    const file = new File(["proof"], "constancia.pdf", { type: "application/pdf" });
    await user.upload(screen.getByTestId("attach-payment-proof-input"), file);
    await user.click(screen.getByRole("button", { name: "Asociar comprobante" }));

    await waitFor(() => {
      expect(mocks.attachPaymentProof).toHaveBeenCalledWith("payment-1", expect.objectContaining({
        proof: file,
        request_allocation_ids: ["allocation-1"],
        operation_reference: "OP-POA-1",
      }));
    });
  });

  it("refresca cola e indicadores de datos pendientes después de asociar constancia", async () => {
    const user = userEvent.setup();
    const activeRefetch = vi.fn().mockResolvedValue(undefined);
    const pendingProofRefetch = vi.fn().mockResolvedValue(undefined);
    const pendingDetailsRefetch = vi.fn().mockResolvedValue(undefined);
    const pendingRefetch = vi.fn().mockResolvedValue(undefined);
    const paidRefetch = vi.fn().mockResolvedValue(undefined);
    const paidPendingProofRequest = makeRequest({
      id: "paid-pending-proof",
      request_code: "SOL-PROOF",
      status: REQUEST_STATUS.PAID,
      payment_id: "payment-1",
      payment_proof_pending: true,
      payment_details_pending: false,
      allocation_count: 1,
      allocations: [makeAllocation()],
      payment: {
        id: "payment-1",
        payment_request_id: "paid-pending-proof",
        paid_at: "2026-06-08T20:00:00.000Z",
        operation_reference: "OP-PAID",
        amount_paid: 100,
        bank_commission: null,
        notes: null,
        proof_document_id: null,
        proofDocument: null,
        proof_pending: true,
        registered_by_id: "user-1",
        created_at: "2026-06-08T20:00:00.000Z",
        updated_at: "2026-06-08T20:00:00.000Z",
        proof_entries: [],
      },
    });
    mocks.attachPaymentProof.mockResolvedValue(makeRequest({
      ...paidPendingProofRequest,
      payment_proof_pending: false,
      payment: paidPendingProofRequest.payment ? {
        ...paidPendingProofRequest.payment,
        proof_document_id: "proof-doc-1",
        proof_pending: false,
      } : undefined,
    }));
    mocks.usePaymentQueue.mockImplementation((params: { status?: string; pending_proof?: boolean; pending_details?: boolean; limit?: number }) => {
      if (params.pending_proof) return { requests: [paidPendingProofRequest], total: 1, isLoading: false, error: null, refetch: pendingProofRefetch };
      if (params.pending_details) return { requests: [], total: 0, isLoading: false, error: null, refetch: pendingDetailsRefetch };
      if (params.status === REQUEST_STATUS.APPROVED && params.limit === 100) return { requests: [], total: 0, isLoading: false, error: null, refetch: pendingRefetch };
      if (params.status === REQUEST_STATUS.PAID && params.limit === 100) return { requests: [paidPendingProofRequest], total: 1, isLoading: false, error: null, refetch: paidRefetch };
      return { requests: [], total: 0, isLoading: false, error: null, refetch: activeRefetch };
    });

    render(<PaymentQueuePage />);

    await user.click(screen.getByTestId("payment-filter-pending-data"));
    await user.click(screen.getByTestId("attach-payment-proof-button"));
    await user.click(screen.getByTestId("attach-proof-allocation-checkbox"));
    const file = new File(["proof"], "constancia.pdf", { type: "application/pdf" });
    await user.upload(screen.getByTestId("attach-payment-proof-input"), file);
    await user.click(screen.getByRole("button", { name: "Asociar comprobante" }));

    await waitFor(() => {
      expect(mocks.attachPaymentProof).toHaveBeenCalledWith("payment-1", expect.objectContaining({ proof: file }));
      expect(activeRefetch).toHaveBeenCalled();
      expect(pendingProofRefetch).toHaveBeenCalled();
      expect(pendingDetailsRefetch).toHaveBeenCalled();
      expect(pendingRefetch).toHaveBeenCalled();
      expect(paidRefetch).toHaveBeenCalled();
    });
  });
});
