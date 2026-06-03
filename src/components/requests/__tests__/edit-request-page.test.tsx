import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditRequestPage } from "@/components/requests/edit-request-page";
import { REQUEST_CURRENCY, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest, type SettlementContextResponse } from "@/types/requests";

const mocks = vi.hoisted(() => ({
  request: null as PaymentRequest | null,
  settlementContext: null as SettlementContextResponse | null,
  settlementContextError: null as Error | null,
  push: vi.fn(),
  refetchRequest: vi.fn(),
  refetchSettlementContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "request-1" }),
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-requests", () => ({
  useRequest: () => ({ request: mocks.request, isLoading: false, error: null, refetch: mocks.refetchRequest }),
  useSettlementContext: () => ({ context: mocks.settlementContext, isLoading: false, error: mocks.settlementContextError, refetch: mocks.refetchSettlementContext }),
}));

vi.mock("@/components/requests/request-form", () => ({
  RequestForm: () => <div data-testid="request-form" />,
}));

function makeRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "request-1",
    request_code: "REXAN-1",
    sequential_number: null,
    request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
    status: REQUEST_STATUS.DRAFT,
    fiscal_year: 2026,
    requested_amount: 100,
    currency: REQUEST_CURRENCY.PEN,
    concept: "Rendición",
    requester_id: "user-1",
    budget_planning_line_id: null,
    budget_month: null,
    organizational_unit_id: null,
    scheduled_rendition_at: null,
    related_request_id: "advance-1",
    supplier_ruc: null,
    supplier_name: null,
    document_type: null,
    has_associated_contract: false,
    beneficiary_name: null,
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
    paid_at: null,
    disbursed_at: null,
    amount_disbursed: null,
    notes: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSettlementContext(): SettlementContextResponse {
  return {
    settlement: {
      id: "request-1",
      request_code: "REXAN-1",
      sequential_number: null,
      request_type: REQUEST_TYPE.ADVANCE_SETTLEMENT,
      status: REQUEST_STATUS.DRAFT,
      requested_amount: 100,
      currency: REQUEST_CURRENCY.PEN,
      concept: "Rendición",
      related_request_id: "advance-1",
    },
    original_advance: {
      id: "advance-1",
      request_code: "ANT-2026-001",
      sequential_number: null,
      requested_amount: 100,
      currency: REQUEST_CURRENCY.PEN,
      concept: "Anticipo",
      requester_id: "user-1",
      beneficiary_name: null,
      budget_planning_line_id: null,
      scheduled_rendition_at: null,
      paid_at: null,
      disbursed_at: null,
      amount_disbursed: null,
    },
    original_advance_documents: [],
    payment: null,
    due_date: null,
    rexan: null,
    settlement_documents: [],
  };
}

beforeEach(() => {
  mocks.request = null;
  mocks.settlementContext = null;
  mocks.settlementContextError = null;
  mocks.push.mockReset();
  mocks.refetchRequest.mockReset();
  mocks.refetchSettlementContext.mockReset();
});

describe("EditRequestPage", () => {
  it("usa encabezado contextual para edición REXAN", () => {
    mocks.request = makeRequest();
    mocks.settlementContext = makeSettlementContext();

    render(<EditRequestPage />);

    expect(screen.getByRole("heading", { name: "Preparar rendición de anticipo" })).toBeInTheDocument();
    expect(screen.getByText("Rinde el anticipo ANT-2026-001 con sus sustentos y revisa el resumen antes de enviarlo.")).toBeInTheDocument();
    expect(screen.queryByText("Editar borrador")).not.toBeInTheDocument();
  });

  it("mantiene encabezado normal para borradores no REXAN", () => {
    mocks.request = makeRequest({ request_type: REQUEST_TYPE.ADVANCE, request_code: "SOL-1", related_request_id: null });

    render(<EditRequestPage />);

    expect(screen.getByRole("heading", { name: "Editar borrador" })).toBeInTheDocument();
    expect(screen.queryByText("Preparar rendición de anticipo")).not.toBeInTheDocument();
  });
});
