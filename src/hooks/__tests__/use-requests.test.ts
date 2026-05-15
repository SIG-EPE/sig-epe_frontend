import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getPaymentQueuePath, getRenditionCountsPath, getRenditionsPath, getRequestsPath, getStartAdvanceSettlementPath, useStartAdvanceSettlement } from "@/hooks/use-requests";
import { api } from "@/lib/api-client";
import { RENDITION_SORT_DIRECTION, RENDITION_SORT_FIELD, RENDITION_STATUS, REQUEST_CURRENCY, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest } from "@/types/requests";

vi.mock("@/lib/api-client", () => ({
  api: {
    post: vi.fn(),
  },
}));

function makeRequest(overrides: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: "settlement-1",
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
    budget_month: 1,
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
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("request hook URL helpers", () => {
  it("serializa filtros multiestado para la bandeja de revisión", () => {
    expect(getRequestsPath({
      page: 2,
      limit: 10,
      statuses: [REQUEST_STATUS.SUBMITTED, REQUEST_STATUS.IN_VALIDATION, REQUEST_STATUS.OBSERVED],
      search: "SOL-2026",
    })).toBe("/requests?page=2&limit=10&statuses=SUBMITTED%2CIN_VALIDATION%2COBSERVED&search=SOL-2026");
  });

  it("serializa la cola de pagos explícita por estado", () => {
    expect(getPaymentQueuePath({ status: REQUEST_STATUS.PAID, page: 1, limit: 20 })).toBe("/requests/payment-queue?page=1&limit=20&status=PAID");
  });

  it("construye la ruta para iniciar una rendición de anticipo", () => {
    expect(getStartAdvanceSettlementPath("advance-1")).toBe("/requests/advance-1/start-advance-settlement");
  });

  it("serializa filtros de bandeja de rendiciones y resumen", () => {
    expect(getRenditionsPath({
      page: 2,
      limit: 10,
      status: RENDITION_STATUS.OVERDUE,
      search: "REXAN",
      due_from: "2026-06-01",
      due_to: "2026-06-30",
      sort: RENDITION_SORT_FIELD.PAID_AT,
      direction: RENDITION_SORT_DIRECTION.DESC,
    })).toBe("/requests/renditions?page=2&limit=10&status=OVERDUE&search=REXAN&due_from=2026-06-01&due_to=2026-06-30&sort=paid_at&direction=desc");
    expect(getRenditionCountsPath({ search: "SOL-2026", sort: RENDITION_SORT_FIELD.DUE_DATE })).toBe("/requests/renditions/counts?search=SOL-2026&sort=due_date");
  });

  it("ejecuta el hook de inicio de rendición contra el endpoint dedicado", async () => {
    vi.mocked(api.post).mockResolvedValueOnce(makeRequest());
    const { result } = renderHook(() => useStartAdvanceSettlement());

    await act(async () => {
      await expect(result.current.startAdvanceSettlement("advance-1")).resolves.toMatchObject({ id: "settlement-1" });
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(api.post).toHaveBeenCalledWith("/requests/advance-1/start-advance-settlement");
  });
});
