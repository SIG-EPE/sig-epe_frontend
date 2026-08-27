import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentQueueTable } from "@/components/payments/payment-queue-table";
import { getPaymentRegisteredToast, PaymentQueuePage } from "@/components/payments/payment-queue-page";
import { REQUEST_CURRENCY, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  bulkMarkPaid: vi.fn(),
  usePaymentQueue: vi.fn(),
}));

vi.mock("@/hooks/use-requests", () => ({
  usePaymentQueue: mocks.usePaymentQueue,
  useBulkMarkPaid: () => ({
    bulkMarkPaid: mocks.bulkMarkPaid,
    isLoading: false,
    error: null,
  }),
  useRegisterPayment: () => ({
    registerPayment: vi.fn(),
    isLoading: false,
    error: null,
  }),
  useCompletePaymentDetails: () => ({
    completePaymentDetails: vi.fn(),
    isLoading: false,
    error: null,
  }),
  useRetryRexanActivation: () => ({
    retryRexanActivation: vi.fn(),
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (
    selector: (state: { user: { id: string; role: { code: string } } }) => unknown,
  ) => selector({ user: { id: "user-1", role: { code: "GIOF_GESTOR" } } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-giof-work", () => ({
  useGiofWorkLeaseSet: () => ({
    leases: [],
    acquire: vi.fn(),
    release: vi.fn(),
    releaseAll: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-drive-projection-polling", () => ({
  useDriveProjectionPolling: vi.fn(),
}));

function pendingSourceRequest(): PaymentRequest {
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
    approved_at: null,
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
      operation_reference: "OP-1",
      amount_paid: 100,
      bank_commission: null,
      notes: null,
      drive_projection_status: "SOURCE_REQUIRED",
      proof_document_id: "proof-1",
      proof_pending: false,
      details_pending: false,
      registered_by_id: "user-1",
      created_at: "2026-05-14T15:30:00.000Z",
      updated_at: "2026-05-14T15:30:00.000Z",
    },
    giof_work: {
      assigneeId: "user-1",
      canAcquire: true,
    } as PaymentRequest["giof_work"],
  };
}

function failedRexanRequest(canAcquire: boolean): PaymentRequest {
  return {
    ...pendingSourceRequest(),
    rexan_activation: {
      status: "FAILED",
      attempt_count: 1,
      next_attempt_at: null,
      settlement_request_id: null,
    },
    giof_work: {
      assigneeId: "user-1",
      canAcquire,
    } as PaymentRequest["giof_work"],
  };
}

describe("payment pending queue action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePaymentQueue.mockReturnValue({
      requests: [],
      total: 0,
      limit: 20,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("keeps the REXAN success title and explains asynchronous Drive organization", () => {
    expect(
      getPaymentRegisteredToast({
        request: pendingSourceRequest(),
        payment_id: "payment-1",
        rexan_activation: { status: "CREATED" },
      }),
    ).toEqual({
      title: "Pago registrado. REXAN activada.",
      description:
        "La carpeta de la solicitud se organizará en Drive en segundo plano; puede tardar algunos minutos.",
    });
  });

  it("shows the source badge and exactly one Completar pago action", () => {
    render(
      <PaymentQueueTable
        requests={[pendingSourceRequest()]}
        isLoading={false}
        onRegisterPayment={vi.fn()}
        onCompletePaymentDetails={vi.fn()}
        onAttachPaymentProof={vi.fn()}
        currentUserId="user-1"
      />,
    );

    expect(screen.getByText("Falta cuenta de origen")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Completar pago" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Agregar constancia de pago" })).not.toBeInTheDocument();
  });

  it("does not expose bulk payment selection or actions on the payment queue page", () => {
    mocks.usePaymentQueue.mockReturnValue({
      requests: [
        {
          ...pendingSourceRequest(),
          status: REQUEST_STATUS.APPROVED,
          paid_at: null,
          payment_id: undefined,
          payment: undefined,
        },
      ],
      total: 1,
      limit: 20,
      isLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PaymentQueuePage />);

    expect(screen.queryByRole("checkbox", { name: /pago masivo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pago masivo|marcar como pagadas/i })).not.toBeInTheDocument();
    expect(mocks.bulkMarkPaid).not.toHaveBeenCalled();
  });

  it.each([
    { canAcquire: true, hasRetryCapability: true, visible: true },
    { canAcquire: false, hasRetryCapability: true, visible: false },
    { canAcquire: true, hasRetryCapability: false, visible: false },
  ])(
    "gates REXAN retry by capability and server work state: $canAcquire/$hasRetryCapability",
    ({ canAcquire, hasRetryCapability, visible }) => {
      render(
        <PaymentQueueTable
          requests={[failedRexanRequest(canAcquire)]}
          isLoading={false}
          onRegisterPayment={vi.fn()}
          onRetryRexanActivation={hasRetryCapability ? vi.fn() : undefined}
          currentUserId="user-1"
        />,
      );

      const retry = screen.queryByRole("button", { name: "Reintentar REXAN" });
      expect(Boolean(retry)).toBe(visible);
    },
  );
});
