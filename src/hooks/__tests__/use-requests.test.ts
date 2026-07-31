import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPaymentQueuePath, getRenditionCountsPath, getRenditionsPath, getRequestsPath, getSettlementContextPath, getStartAdvanceSettlementPath, invalidateRequestCaches, useBulkMarkPaid, useCompletePaymentDetails, useHydrateRequestPlanningLines, useRequest, useRequestDocuments, useRequestPlanningLineFacets, useRequestPlanningLineSearch, useRequestReceiptReviews, useRequestRenditionReport, useRequestRenditionReportActions, useSettlementContext, useStartAdvanceSettlement } from "@/hooks/use-requests";
import { api } from "@/lib/api-client";
import { clearQueryCache } from "@/lib/query-cache";
import { RENDITION_BUCKET, RENDITION_SORT_DIRECTION, RENDITION_SORT_FIELD, RENDITION_STATUS, REQUEST_CURRENCY, REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest, type RequestPlanningLineFacetsResponse, type RequestPlanningLineHydrateResponse, type RequestPlanningLineSearchResponse } from "@/types/requests";

vi.mock("@/lib/api-client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    postForm: vi.fn(),
    patchForm: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearQueryCache();
  vi.useRealTimers();
});

function makePlanningLineSearchResponse(id: string): RequestPlanningLineSearchResponse {
  return {
    items: [{
      id,
      line_code: `POA-${id}`,
      resource_description: id,
      planning_type: "PROGRAMA",
      fiscal_year: { id: "fy-1", year: 2026 },
      org_unit: { id: "org-1", name: "Operaciones", code: "OPS" },
      program: null,
      component: null,
      operative_action: null,
      category: null,
      territory: null,
    }],
    total: 1,
    page: 1,
    limit: 25,
    has_more: false,
  };
}

describe("planning line lazy search", () => {
  it("does not fetch without intent or with one character", async () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(
      ({ search, enabled }) => useRequestPlanningLineSearch({ search }, enabled),
      { initialProps: { search: "", enabled: false } },
    );

    rerender({ search: "p", enabled: false });
    await act(async () => vi.advanceTimersByTime(350));

    expect(api.get).not.toHaveBeenCalled();
  });

  it("debounces 300 ms and discards an obsolete response", async () => {
    vi.useFakeTimers();
    const oldRequest = deferred<RequestPlanningLineSearchResponse>();
    const currentRequest = deferred<RequestPlanningLineSearchResponse>();
    vi.mocked(api.get)
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(currentRequest.promise);
    const { result, rerender } = renderHook(
      ({ search, enabled }) => useRequestPlanningLineSearch({ search }, enabled),
      { initialProps: { search: "old-term-4267", enabled: false } },
    );

    await act(async () => vi.advanceTimersByTime(300));
    rerender({ search: "old-term-4267", enabled: true });
    expect(api.get).toHaveBeenCalledTimes(1);
    rerender({ search: "new-term-4267", enabled: true });
    await act(async () => vi.advanceTimersByTime(300));
    expect(api.get).toHaveBeenCalledTimes(2);

    await act(async () => {
      currentRequest.resolve(makePlanningLineSearchResponse("current"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.items[0]?.id).toBe("current");
    await act(async () => {
      oldRequest.resolve(makePlanningLineSearchResponse("obsolete"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.items[0]?.id).toBe("current");
    expect(vi.mocked(api.get).mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("preserves prior results when load-more fails and retries only that page without duplicates", async () => {
    const firstPage = makePlanningLineSearchResponse("line-1");
    firstPage.total = 2;
    firstPage.has_more = true;
    const secondPage = makePlanningLineSearchResponse("line-1");
    secondPage.items.push(makePlanningLineSearchResponse("line-2").items[0]);
    secondPage.total = 2;
    secondPage.page = 2;

    vi.mocked(api.get)
      .mockResolvedValueOnce(firstPage)
      .mockRejectedValueOnce(new Error("No se pudo cargar la siguiente página"))
      .mockResolvedValueOnce(secondPage);

    const { result } = renderHook(() => useRequestPlanningLineSearch({ search: "page-failure-4277" }, true));
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(["line-1"]));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.error?.message).toBe("No se pudo cargar la siguiente página"));
    expect(result.current.items.map((item) => item.id)).toEqual(["line-1"]);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.items.map((item) => item.id)).toEqual(["line-1", "line-2"]));
    expect(result.current.error).toBeNull();
    expect(api.get).toHaveBeenCalledTimes(3);
    expect(vi.mocked(api.get).mock.calls.map(([path]) => path)).toEqual([
      expect.stringContaining("page=1"),
      expect.stringContaining("page=2"),
      expect.stringContaining("page=2"),
    ]);
  });

  it("caches facets by ancestor filters and invalidates them with the POA domain", async () => {
    const first: RequestPlanningLineFacetsResponse = {
      org_units: [{ id: "org-parent", code: "P", name: "Parent" }],
      planning_types: ["PROGRAMA"],
      programs: [],
      components: [],
      operative_actions: [],
      categories: [],
      territories: [],
    };
    const second = { ...first, planning_types: ["PROYECTO"] };
    vi.mocked(api.get).mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    const filters = { org_unit_id: "org-parent", scope: "hierarchy" as const };
    const firstRender = renderHook(() => useRequestPlanningLineFacets(filters, true));
    await waitFor(() => expect(firstRender.result.current.data?.planning_types).toEqual(["PROGRAMA"]));
    firstRender.unmount();

    const cachedRender = renderHook(() => useRequestPlanningLineFacets(filters, true));
    await waitFor(() => expect(cachedRender.result.current.data?.planning_types).toEqual(["PROGRAMA"]));
    expect(api.get).toHaveBeenCalledTimes(1);
    cachedRender.unmount();

    invalidateRequestCaches();
    const refreshedRender = renderHook(() => useRequestPlanningLineFacets(filters, true));
    await waitFor(() => expect(refreshedRender.result.current.data?.planning_types).toEqual(["PROYECTO"]));
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("hydrates selected out-of-page lines, reports unavailable ids, and preserves selection across retry", async () => {
    const hydrated: RequestPlanningLineHydrateResponse = {
      items: makePlanningLineSearchResponse("selected-out-of-page").items,
      unavailable_ids: ["unavailable-id"],
    };
    vi.mocked(api.post)
      .mockResolvedValueOnce(hydrated)
      .mockRejectedValueOnce(new Error("temporary hydrate failure"))
      .mockResolvedValueOnce(hydrated);
    const { result } = renderHook(() => useHydrateRequestPlanningLines(["selected-out-of-page", "unavailable-id"]));

    await waitFor(() => expect(result.current.items[0]?.id).toBe("selected-out-of-page"));
    expect(result.current.unavailableIds).toEqual(["unavailable-id"]);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error?.message).toBe("temporary hydrate failure"));
    expect(result.current.items[0]?.id).toBe("selected-out-of-page");

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.items[0]?.id).toBe("selected-out-of-page");
    expect(api.post).toHaveBeenCalledTimes(3);
  });
});

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { isLoading: boolean; accessToken: string | null }) => unknown) => selector({ isLoading: false, accessToken: "token" }),
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

  it("serializa fecha exacta de historial como rango inclusivo del mismo día", () => {
    expect(getRequestsPath({
      scope: "history",
      date_field: "updated_at",
      date_from: "2026-06-01",
      date_to: "2026-06-01",
    })).toBe("/requests?date_from=2026-06-01&date_to=2026-06-01&date_field=updated_at&scope=history");
  });

  it("serializa la cola de pagos explícita por estado", () => {
    expect(getPaymentQueuePath({ status: REQUEST_STATUS.PAID, page: 1, limit: 20 })).toBe("/requests/payment-queue?page=1&limit=20&status=PAID");
  });

  it("serializa filtros de datos pendientes de pago", () => {
    expect(getPaymentQueuePath({ status: REQUEST_STATUS.PAID, pending_proof: true, pending_details: false, page: 1, limit: 20 })).toBe("/requests/payment-queue?page=1&limit=20&status=PAID&pending_proof=true&pending_details=false");
  });

  it("construye la ruta para iniciar una rendición de anticipo", () => {
    expect(getStartAdvanceSettlementPath("advance-1")).toBe("/requests/advance-1/start-advance-settlement");
  });

  it("construye la ruta para cargar contexto de rendición", () => {
    expect(getSettlementContextPath("settlement-1")).toBe("/requests/settlement-1/settlement-context");
  });

  it("serializa filtros de bandeja de rendiciones y resumen", () => {
    expect(getRenditionsPath({
      page: 2,
      limit: 10,
      status: RENDITION_STATUS.OVERDUE,
      bucket: RENDITION_BUCKET.DUE_SOON,
      search: "REXAN",
      due_from: "2026-06-01",
      due_to: "2026-06-30",
      sort: RENDITION_SORT_FIELD.PAID_AT,
      direction: RENDITION_SORT_DIRECTION.DESC,
    })).toBe("/requests/renditions?page=2&limit=10&status=OVERDUE&bucket=due_soon&search=REXAN&due_from=2026-06-01&due_to=2026-06-30&sort=paid_at&direction=desc");
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

  it("carga contexto de rendición solo cuando está habilitado", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ settlement: { id: "settlement-1" } });
    const { result } = renderHook(() => useSettlementContext("settlement-1", true));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(api.get).toHaveBeenCalledWith("/requests/settlement-1/settlement-context");
    expect(result.current.context).toMatchObject({ settlement: { id: "settlement-1" } });
  });

  it("no carga contexto de rendición cuando el flujo no es REXAN", () => {
    renderHook(() => useSettlementContext("request-1", false));

    expect(api.get).not.toHaveBeenCalledWith("/requests/request-1/settlement-context");
  });

  it("ejecuta marcado masivo pagado con contrato JSON confirmado", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      batch_id: "batch-1",
      item_count: 2,
      success_count: 2,
      failed_count: 0,
      total_amount: 150,
      results: [],
    });
    const { result } = renderHook(() => useBulkMarkPaid());

    await act(async () => {
      await expect(result.current.bulkMarkPaid({
        request_ids: ["req-1", "req-2"],
        paid_at: "2026-05-30T10:00:00.000Z",
        operation_reference: "OP-1",
        notes: "Pagado por lote",
      })).resolves.toMatchObject({ batch_id: "batch-1" });
    });

    expect(api.post).toHaveBeenCalledWith("/requests/bulk/mark-paid", {
      request_ids: ["req-1", "req-2"],
      paid_at: "2026-05-30T10:00:00.000Z",
      operation_reference: "OP-1",
      notes: "Pagado por lote",
    });
  });

  it("ejecuta completado de datos de pago como multipart sin monto ni fecha", async () => {
    vi.mocked(api.patchForm).mockResolvedValueOnce({ id: "payment-1" });
    const { result } = renderHook(() => useCompletePaymentDetails());

    await act(async () => {
      await result.current.completePaymentDetails("payment-1", {
        proof: new File(["proof"], "constancia.pdf", { type: "application/pdf" }),
        operation_reference: " OP-2 ",
        bank_commission: 1.5,
        notes: "Listo",
      });
    });

    expect(api.patchForm).toHaveBeenCalledWith("/request-payments/payment-1/details", expect.any(FormData));
    const formData = vi.mocked(api.patchForm).mock.calls.at(-1)?.[1] as FormData;
    expect(formData.get("operation_reference")).toBe("OP-2");
    expect(formData.get("bank_commission")).toBe("1.5");
    expect(formData.has("amount_paid")).toBe(false);
    expect(formData.has("paid_at")).toBe(false);
  });

  it("mantiene la solicitud visible durante un refetch en segundo plano", async () => {
    vi.mocked(api.get).mockResolvedValueOnce(makeRequest({ concept: "Inicial" }));
    const { result } = renderHook(() => useRequest("request-1"));

    await waitFor(() => expect(result.current.request?.concept).toBe("Inicial"));
    expect(result.current.isInitialLoading).toBe(false);

    const background = deferred<PaymentRequest>();
    vi.mocked(api.get).mockReturnValueOnce(background.promise);

    let refetchPromise!: Promise<void>;
    act(() => {
      refetchPromise = result.current.refetch({ background: true });
    });
    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.request?.concept).toBe("Inicial");

    await act(async () => {
      background.resolve(makeRequest({ concept: "Actualizada" }));
      await refetchPromise;
    });

    expect(result.current.request?.concept).toBe("Actualizada");
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("parcha documentos y comprobantes sin marcar carga inicial", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { result: documentsResult } = renderHook(() => useRequestDocuments("request-1"));
    const { result: receiptsResult } = renderHook(() => useRequestReceiptReviews("request-1"));

    await waitFor(() => expect(documentsResult.current.isLoading).toBe(false));
    await waitFor(() => expect(receiptsResult.current.isLoading).toBe(false));

    act(() => {
      documentsResult.current.upsertDocument({ id: "doc-1", document_category: "REQUEST_SUPPORT" } as never);
      receiptsResult.current.upsertReceipt({ id: "receipt-review-1", receipt: { id: "receipt-1" } } as never);
    });

    expect(documentsResult.current.documents).toHaveLength(1);
    expect(receiptsResult.current.receipts).toHaveLength(1);
    expect(documentsResult.current.isLoading).toBe(false);
    expect(receiptsResult.current.isLoading).toBe(false);
  });

  it("actualiza filas del informe localmente y conserva el informe montado", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ rows: [], totals: { missing_allocations: [] }, allocation_coverage: [] });
    const { result } = renderHook(() => useRequestRenditionReport("request-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.upsertReportRow({ id: "row-1", amount: 50 } as never);
    });

    expect(result.current.report?.rows).toHaveLength(1);
    expect(result.current.isLoading).toBe(false);

    act(() => {
      result.current.removeReportRow("row-1");
    });

    expect(result.current.report?.rows).toHaveLength(0);
  });

  it("genera informe de rendición con respuesta de informe y documento", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ report: { id: "report-1" }, document: { id: "document-1" } });
    const { result } = renderHook(() => useRequestRenditionReportActions());

    await act(async () => {
      await expect(result.current.generateReport("settlement-1")).resolves.toMatchObject({
        report: { id: "report-1" },
        document: { id: "document-1" },
      });
    });

    expect(api.post).toHaveBeenCalledWith("/requests/settlement-1/rendition-report/generate");
  });

  it("registra y elimina devolución de línea POA usando endpoints allocation-scoped", async () => {
    vi.mocked(api.patch).mockResolvedValueOnce({ id: "report-1" });
    vi.mocked(api.delete).mockResolvedValueOnce({ deleted: true });
    const { result } = renderHook(() => useRequestRenditionReportActions());

    await act(async () => {
      await expect(result.current.upsertLineReturn("settlement-1", "allocation-1", {
        returned_amount: 175,
        justification: "Saldo no utilizado.",
        return_proof_document_id: "document-1",
      })).resolves.toMatchObject({ id: "report-1" });
    });

    expect(api.patch).toHaveBeenCalledWith("/requests/settlement-1/rendition-report/line-returns/allocation-1", {
      returned_amount: 175,
      justification: "Saldo no utilizado.",
      return_proof_document_id: "document-1",
    });

    await act(async () => {
      await expect(result.current.deleteLineReturn("settlement-1", "allocation-1")).resolves.toMatchObject({ deleted: true });
    });

    expect(api.delete).toHaveBeenCalledWith("/requests/settlement-1/rendition-report/line-returns/allocation-1");
  });
});
