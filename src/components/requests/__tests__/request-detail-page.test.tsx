import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "@/lib/api-client";
import { formatRequestCurrency } from "@/lib/requests";
import { RequestDetailPage } from "@/components/requests/request-detail-page";
import { REQUEST_TYPE, type FxValuation, type PaymentRequest, type RequestPayment } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refetch: vi.fn(),
  useRequest: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "request-secret" }),
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { id: "user-1", role: { code: "SOLICITANTE_EPE" } },
  }),
}));

vi.mock("@/hooks/use-requests", () => ({
  useRequest: () => mocks.useRequest(),
  useRequestDocuments: () => ({ documents: [], isLoading: false, refetch: vi.fn() }),
  useRequestRenditionReport: () => ({ report: null, isLoading: false, refetch: vi.fn() }),
  useSettlementContext: () => ({ context: null, isLoading: false, refetch: vi.fn() }),
  useApproveRequest: () => ({ approveRequest: vi.fn(), isLoading: false }),
  useObserveRequest: () => ({ observeRequest: vi.fn(), isLoading: false }),
  useRejectRequest: () => ({ rejectRequest: vi.fn(), isLoading: false }),
  useStartAdvanceSettlement: () => ({ startAdvanceSettlement: vi.fn(), isLoading: false }),
  useRetryRexanActivation: () => ({ retryRexanActivation: vi.fn(), isLoading: false }),
}));

vi.mock("@/hooks/use-giof-work", () => ({
  useAutoAcquireGiofWorkLease: () => ({ release: vi.fn() }),
}));

vi.mock("@/hooks/use-drive-projection-polling", () => ({
  useDriveProjectionPolling: vi.fn(),
}));

vi.mock("@/components/requests/request-documents-card", () => ({
  RequestDocumentsCard: () => null,
}));
vi.mock("@/components/requests/request-extra-documents-modal", () => ({
  RequestExtraDocumentsModal: () => null,
}));
vi.mock("@/components/requests/structured-rendition-report-card", () => ({
  StructuredRenditionReportCard: () => null,
}));

const valuation: FxValuation = {
  amount_pen: "375.00", accounting_currency: "PEN", state: "PROVISIONAL",
  reference: null, final_rate: null, final_confirmed_at: null,
  final_confirmed_by: null, origin_execution_id: null,
};

function makeRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "request-secret", request_code: "USD-100", sequential_number: null,
    request_type: REQUEST_TYPE.SUPPLIER_PAYMENT, status: "PAID", fiscal_year: 2026,
    requested_amount: 100, currency: "USD", concept: "Detalle mensual",
    requester_id: "user-1", budget_planning_line_id: null, budget_month: 9,
    organizational_unit_id: null, scheduled_rendition_at: null,
    related_request_id: null, supplier_ruc: null, supplier_name: null,
    document_type: null, has_associated_contract: false,
    beneficiary_name: "Beneficiario", beneficiary_document_type: null,
    beneficiary_document_number: null, bank_code: null, bank_name: null,
    account_type: null, bank_account: null, bank_cci: null,
    submitted_at: null, observed_at: null, approved_at: null, rejected_at: null,
    paid_at: null, disbursed_at: null, amount_disbursed: null, notes: null,
    created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z",
    fx_policy_version: "MONTHLY_V1", valuation,
    monthly_fx_applied_close_month: null, monthly_fx_applied_close_rate: null,
    ...overrides,
  };
}

function makePayment(overrides: Partial<RequestPayment> = {}): RequestPayment {
  return {
    id: "payment-1", payment_request_id: "request-secret",
    paid_at: "2026-09-15T10:00:00Z", operation_reference: null,
    amount_paid: 100, bank_commission: null, notes: null,
    proof_document_id: null, registered_by_id: "giof-1",
    created_at: "2026-09-15T10:00:00Z", updated_at: "2026-09-15T10:00:00Z",
    valuation, monthly_fx_reference: { year: 2026, month: 9, reference_rate: "3.75" },
    ...overrides,
  };
}

function loadRequest(request: PaymentRequest): void {
  mocks.useRequest.mockReturnValue({
    request, isInitialLoading: false, isRefreshing: false, error: null,
    refetch: mocks.refetch, patchRequest: vi.fn(),
  });
}

describe("RequestDetailPage actual valuation integration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps original USD separate from server PEN and bank/approval/close stages", () => {
    const reference: NonNullable<FxValuation["reference"]> = {
      rate: "3.70", source: "MANUAL", side: "SALE", series: null,
      effective_date: "2026-09-01", retrieved_at: "2026-09-02T10:00:00Z",
      manual_source: null, reason: null,
    };
    const open = makeRequest({ payment: makePayment({ valuation: { ...valuation, reference } }) });
    loadRequest(open);
    const { rerender } = render(<RequestDetailPage />);
    expect(screen.getByText(formatRequestCurrency(100, "USD").replace(/\s/g, " "))).toBeInTheDocument();
    expect(screen.getByText(/PEN 375.00.*Provisional/)).toBeInTheDocument();
    expect(screen.getByText(/Referencia bancaria mensual: 3.75.*2026-09/)).toBeInTheDocument();
    expect(screen.getByText(/Aprobación: 3.70/)).toBeInTheDocument();
    expect(screen.queryByText(/TC final confirmado|TC de cierre mensual/)).not.toBeInTheDocument();

    const finalValuation: FxValuation = {
      ...valuation, reference, amount_pen: "378.00", state: "FINAL", final_rate: "3.780000000000",
    };
    const closed = makeRequest({
      monthly_fx_applied_close_month: "2026-09-01",
      monthly_fx_applied_close_rate: "3.780000000000",
      payment: makePayment({ valuation: finalValuation }),
    });
    loadRequest(closed);
    rerender(<RequestDetailPage />);
    expect(screen.getByText(/PEN 378.00.*Cerrado/)).toBeInTheDocument();
    expect(screen.getByText(/TC de cierre mensual: 3.78.*2026-09/)).toBeInTheDocument();
    loadRequest({ ...closed, payment: makePayment({ valuation: finalValuation, paid_at: "2026-10-05T10:00:00Z" }) });
    rerender(<RequestDetailPage />);
    expect(screen.getByText(formatRequestCurrency(100, "USD").replace(/\s/g, " "))).toBeInTheDocument();
    expect(screen.getByText(/PEN 378.00.*Cerrado/)).toBeInTheDocument();
    expect(screen.getByText(/TC de cierre mensual: 3.78.*2026-09/)).toBeInTheDocument();
    expect(screen.getByText(/Referencia bancaria mensual: 3.75.*2026-09/)).toBeInTheDocument();
    expect(screen.queryByText(/TC final confirmado/)).not.toBeInTheDocument();
    expect(mocks.refetch).not.toHaveBeenCalled();
  });

  it.each([null, undefined, makePayment({ valuation: null, monthly_fx_reference: null })])(
    "uses request valuation when payment evidence is absent: %s",
    (payment) => {
      loadRequest(makeRequest({ payment }));
      render(<RequestDetailPage />);
      expect(screen.getByText(/PEN 375.00.*Provisional/)).toBeInTheDocument();
      expect(screen.queryByText(/Referencia bancaria|TC final confirmado/)).not.toBeInTheDocument();
    },
  );

  it("preserves exact rate strings and displays stored PEN without recalculation", () => {
    loadRequest(makeRequest({
      monthly_fx_applied_close_month: "2026-09-01",
      monthly_fx_applied_close_rate: "3.123456789012",
      payment: makePayment({
        valuation: { ...valuation, amount_pen: "378.00", state: "FINAL" },
        monthly_fx_reference: { year: 2026, month: 9, reference_rate: "3.234567890123" },
      }),
    }));
    render(<RequestDetailPage />);
    expect(screen.getByText(/PEN 378.00.*Cerrado/)).toBeInTheDocument();
    expect(screen.getByText(/TC de cierre mensual: 3.123456789012/)).toBeInTheDocument();
    expect(screen.getByText(/Referencia bancaria mensual: 3.234567890123/)).toBeInTheDocument();
  });

  it.each([
    ["2026-09-01", null], [null, "3.78"], ["2026-09-02", "3.78"],
    ["2026-13-01", "3.78"], ["2026-09-01", " 3.78"], ["2026-09-01", "0"],
  ])("fails closed for partial/malformed close pair %s / %s", (month, rate) => {
    loadRequest(makeRequest({
      monthly_fx_applied_close_month: month, monthly_fx_applied_close_rate: rate,
      payment: makePayment({ valuation: { ...valuation, state: "FINAL", final_rate: "3.78" } }),
    }));
    render(<RequestDetailPage />);
    expect(screen.getByText(/PEN 375.00.*Provisional/)).toBeInTheDocument();
    expect(screen.queryByText(/Cerrado|TC de cierre|TC final confirmado/)).not.toBeInTheDocument();
  });

  it("preserves legacy manual source and individual confirmed rate labels", () => {
    loadRequest(makeRequest({
      fx_policy_version: null,
      payment: makePayment({ valuation: {
        ...valuation, state: "FINAL", final_rate: "3.81", final_confirmed_at: "2026-09-03",
        reference: { rate: "3.70", source: "MANUAL", side: "SALE", series: null,
          effective_date: "2026-09-01", retrieved_at: "2026-09-02T10:00:00Z",
          manual_source: "Histórico", reason: null },
      } }),
    }));
    render(<RequestDetailPage />);
    expect(screen.getByText(/PEN 375.00.*Final/)).toBeInTheDocument();
    expect(screen.getByText(/TC referencial: 3.70.*MANUAL.*2026-09-01/)).toBeInTheDocument();
    expect(screen.getByText("Fuente manual: Histórico")).toBeInTheDocument();
    expect(screen.getByText(/TC final confirmado: 3.81.*2026-09-03/)).toBeInTheDocument();
    expect(screen.queryByText(/Referencia bancaria mensual|Cerrado/)).not.toBeInTheDocument();
  });

  it("retains PEN REXAN identity and original amount", () => {
    loadRequest(makeRequest({
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT, currency: "PEN", fx_policy_version: null,
      valuation: { ...valuation, amount_pen: "100.00", state: "IDENTITY" },
    }));
    render(<RequestDetailPage />);
    expect(screen.getByText(/PEN 100.00.*Identidad PEN/)).toBeInTheDocument();
    expect(screen.getByText(formatRequestCurrency(100, "PEN").replace(/\s/g, " "))).toBeInTheDocument();
    expect(screen.queryByText(/Referencia bancaria|TC de cierre|TC final confirmado/)).not.toBeInTheDocument();
  });
});

function apiError(status: number): ApiRequestError {
  return new ApiRequestError(status, {
    statusCode: status,
    message: "sensitive backend detail",
    error: "Error",
    timestamp: "2026-09-17T00:00:00.000Z",
    path: "/requests/request-secret",
  });
}

describe("RequestDetailPage error states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [403, "No tienes acceso a esta solicitud."],
    [404, "La solicitud no existe o ya no está disponible."],
  ])("renders a safe %s state without retrying or exposing backend details", (status, message) => {
    mocks.useRequest.mockReturnValue({
      request: null,
      isInitialLoading: false,
      isRefreshing: false,
      error: apiError(status),
      refetch: mocks.refetch,
      patchRequest: vi.fn(),
    });

    render(<RequestDetailPage />);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText("sensitive backend detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /volver a solicitudes/i }));
    expect(mocks.push).toHaveBeenCalledWith("/requests");
    expect(window.location.pathname).not.toBe("/login");
  });

  it("retains generic retry behavior for non-terminal errors", () => {
    mocks.useRequest.mockReturnValue({
      request: null,
      isInitialLoading: false,
      isRefreshing: false,
      error: new Error("No se pudo cargar"),
      refetch: mocks.refetch,
      patchRequest: vi.fn(),
    });

    render(<RequestDetailPage />);
    expect(screen.getByText("No se pudo cargar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });
});
