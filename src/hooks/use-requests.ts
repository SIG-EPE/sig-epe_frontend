"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { cachedQuery, QUERY_CACHE_TTL_MS, stableSerialize } from "@/lib/query-cache";
import { QUERY_TAGS, invalidateRequestDomain } from "@/lib/query-tags";
import { useAuthStore } from "@/stores/auth-store";
import { REQUEST_DOCUMENT_CATEGORY } from "@/types/requests";
import type {
  AttachPaymentProofInput,
  BudgetPreviewInput,
  BulkMarkPaidInput,
  BulkMarkPaidResponse,
  CompletePaymentDetailsInput,
  CreateManualRenditionRowInput,
  ApproveRequestDto,
  CreateRequestDto,
  ObserveRequestDto,
  PaymentRequest,
  PaymentQueueFilters,
  RegisterPaymentInput,
  RenditionsInboxFilters,
  RenditionsInboxResponse,
  RenditionInboxCounts,
  RequestBudgetPreview,
  RequestAllocationsBudgetPreview,
  RequestPlanningLineLookupResponse,
  RequestDocument,
  RequestReceiptReview,
  RequestRenditionReport,
  RequestRenditionGenerateResponse,
  RequestRenditionRow,
  RequestRenditionValidationResponse,
  StartAdvanceSettlementResponse,
  UpdateRenditionRowInput,
  UpdateRequestReceiptReviewInput,
  UpsertRenditionLineReturnInput,
  UploadRequestDocumentInput,
  RejectRequestDto,
  RequestsListFilters,
  RequestsListResponse,
  SettlementContextResponse,
  UpdateRequestDto,
} from "@/types/requests";

function appendIfPresent(params: URLSearchParams, key: string, value: string | number | boolean | undefined): void {
  if (value !== undefined && value !== "") {
    params.set(key, String(value));
  }
}

export interface RequestResourceRefetchOptions {
  background?: boolean;
  force?: boolean;
}

export interface RequestResourceState<T> {
  data: T | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: (options?: RequestResourceRefetchOptions) => Promise<void>;
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const existingIndex = items.findIndex((candidate) => candidate.id === item.id);
  if (existingIndex === -1) return [...items, item];
  return items.map((candidate, index) => index === existingIndex ? item : candidate);
}

export function getRequestsPath(filters?: RequestsListFilters): string {
  const params = new URLSearchParams();
  appendIfPresent(params, "page", filters?.page);
  appendIfPresent(params, "limit", filters?.limit);
  appendIfPresent(params, "status", filters?.status);
  if (filters?.statuses?.length) {
    params.set("statuses", filters.statuses.join(","));
  }
  appendIfPresent(params, "request_type", filters?.request_type);
  appendIfPresent(params, "budget_planning_line_id", filters?.budget_planning_line_id);
  appendIfPresent(params, "org_unit_id", filters?.org_unit_id);
  appendIfPresent(params, "requester_id", filters?.requester_id);
  appendIfPresent(params, "date_from", filters?.date_from);
  appendIfPresent(params, "date_to", filters?.date_to);
  appendIfPresent(params, "date_field", filters?.date_field);
  appendIfPresent(params, "has_documents", filters?.has_documents);
  appendIfPresent(params, "drive_sync_status", filters?.drive_sync_status);
  appendIfPresent(params, "search", filters?.search);
  appendIfPresent(params, "scope", filters?.scope);
  const query = params.toString();
  return `/requests${query ? `?${query}` : ""}`;
}

export function getPaymentQueuePath(filters?: PaymentQueueFilters): string {
  const params = new URLSearchParams();
  appendIfPresent(params, "page", filters?.page);
  appendIfPresent(params, "limit", filters?.limit);
  appendIfPresent(params, "status", filters?.status);
  appendIfPresent(params, "pending_proof", filters?.pending_proof);
  appendIfPresent(params, "pending_details", filters?.pending_details);
  appendIfPresent(params, "search", filters?.search);
  const query = params.toString();
  return `/requests/payment-queue${query ? `?${query}` : ""}`;
}

export function getRenditionsPath(filters?: RenditionsInboxFilters): string {
  const params = new URLSearchParams();
  appendIfPresent(params, "page", filters?.page);
  appendIfPresent(params, "limit", filters?.limit);
  appendIfPresent(params, "status", filters?.status);
  appendIfPresent(params, "bucket", filters?.bucket);
  appendIfPresent(params, "search", filters?.search);
  appendIfPresent(params, "due_from", filters?.due_from);
  appendIfPresent(params, "due_to", filters?.due_to);
  appendIfPresent(params, "sort", filters?.sort);
  appendIfPresent(params, "direction", filters?.direction);
  const query = params.toString();
  return `/requests/renditions${query ? `?${query}` : ""}`;
}

export function getRenditionCountsPath(filters?: Omit<RenditionsInboxFilters, "status" | "bucket" | "page" | "limit">): string {
  const params = new URLSearchParams();
  appendIfPresent(params, "search", filters?.search);
  appendIfPresent(params, "due_from", filters?.due_from);
  appendIfPresent(params, "due_to", filters?.due_to);
  appendIfPresent(params, "sort", filters?.sort);
  appendIfPresent(params, "direction", filters?.direction);
  const query = params.toString();
  return `/requests/renditions/counts${query ? `?${query}` : ""}`;
}

export function getStartAdvanceSettlementPath(requestId: string): string {
  return `/requests/${requestId}/start-advance-settlement`;
}

export function getSettlementContextPath(requestId: string): string {
  return `/requests/${requestId}/settlement-context`;
}

export function getRenditionReportPath(requestId: string): string {
  return `/requests/${requestId}/rendition-report`;
}

export function useRequests(filters?: RequestsListFilters) {
  const pageFilter = filters?.page;
  const limitFilter = filters?.limit;
  const statusFilter = filters?.status;
  const statusesFilter = filters?.statuses?.join(",") ?? "";
  const requestTypeFilter = filters?.request_type;
  const planningLineFilter = filters?.budget_planning_line_id;
  const orgUnitFilter = filters?.org_unit_id;
  const requesterFilter = filters?.requester_id;
  const dateFromFilter = filters?.date_from;
  const dateToFilter = filters?.date_to;
  const dateFieldFilter = filters?.date_field;
  const hasDocumentsFilter = filters?.has_documents;
  const driveSyncStatusFilter = filters?.drive_sync_status;
  const searchFilter = filters?.search;
  const scopeFilter = filters?.scope;

  const resource = useCachedResource<RequestsListResponse>({
    key: [QUERY_TAGS.REQUESTS, "list", filters ?? {}],
    ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
    tags: [QUERY_TAGS.REQUESTS],
    errorMessage: "Error al cargar solicitudes",
    queryFn: (signal) => api.get<RequestsListResponse>(getRequestsPath(filters), { signal }),
  });
  const data = resource.data;

  return {
    requests: data?.requests ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? pageFilter ?? 1,
    limit: data?.limit ?? limitFilter ?? 20,
    isLoading: resource.isLoading,
    isInitialLoading: resource.isInitialLoading,
    isRefreshing: resource.isRefreshing,
    error: resource.error,
    refetch: resource.refetch,
  };
}

export function usePaymentQueue(filters?: PaymentQueueFilters) {
  const pageFilter = filters?.page;
  const limitFilter = filters?.limit;
  const statusFilter = filters?.status;
  const pendingProofFilter = filters?.pending_proof;
  const pendingDetailsFilter = filters?.pending_details;
  const searchFilter = filters?.search;

  const resource = useCachedResource<RequestsListResponse>({
    key: [QUERY_TAGS.PAYMENTS, "queue", filters ?? {}],
    ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
    tags: [QUERY_TAGS.PAYMENTS, QUERY_TAGS.REQUESTS, QUERY_TAGS.DASHBOARD],
    errorMessage: "Error al cargar cola de pagos",
    queryFn: () => api.get<RequestsListResponse>(getPaymentQueuePath(filters)),
  });
  const data = resource.data;

  return {
    requests: data?.requests ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? pageFilter ?? 1,
    limit: data?.limit ?? limitFilter ?? 20,
    isLoading: resource.isLoading,
    isInitialLoading: resource.isInitialLoading,
    isRefreshing: resource.isRefreshing,
    error: resource.error,
    refetch: resource.refetch,
  };
}

export function useRenditionsInbox(filters?: RenditionsInboxFilters) {
  const pageFilter = filters?.page;
  const limitFilter = filters?.limit;
  const statusFilter = filters?.status;
  const bucketFilter = filters?.bucket;
  const searchFilter = filters?.search;
  const dueFromFilter = filters?.due_from;
  const dueToFilter = filters?.due_to;
  const sortFilter = filters?.sort;
  const directionFilter = filters?.direction;

  const resource = useCachedResource<RenditionsInboxResponse>({
    key: [QUERY_TAGS.RENDITIONS, "inbox", filters ?? {}],
    ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
    tags: [QUERY_TAGS.RENDITIONS, QUERY_TAGS.REQUESTS, QUERY_TAGS.DASHBOARD],
    errorMessage: "Error al cargar rendiciones",
    queryFn: () => api.get<RenditionsInboxResponse>(getRenditionsPath(filters)),
  });
  const data = resource.data;

  return {
    renditions: data?.renditions ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? pageFilter ?? 1,
    limit: data?.limit ?? limitFilter ?? 20,
    counts: data?.counts,
    isLoading: resource.isLoading,
    isInitialLoading: resource.isInitialLoading,
    isRefreshing: resource.isRefreshing,
    error: resource.error,
    refetch: resource.refetch,
  };
}

export function useRenditionCounts(filters?: Omit<RenditionsInboxFilters, "status" | "bucket" | "page" | "limit">) {
  const resource = useCachedResource<RenditionInboxCounts>({
    key: [QUERY_TAGS.RENDITIONS, "counts", filters ?? {}],
    ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
    tags: [QUERY_TAGS.RENDITIONS, QUERY_TAGS.REQUESTS, QUERY_TAGS.DASHBOARD],
    errorMessage: "Error al cargar resumen de rendiciones",
    queryFn: () => api.get<RenditionInboxCounts>(getRenditionCountsPath(filters)),
  });

  return { counts: resource.data, isLoading: resource.isLoading, isInitialLoading: resource.isInitialLoading, isRefreshing: resource.isRefreshing, error: resource.error, refetch: resource.refetch };
}

export function useRegisterPayment() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const registerPayment = async (requestId: string, input: RegisterPaymentInput): Promise<PaymentRequest> => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("paid_at", input.paid_at);
      formData.append("operation_reference", input.operation_reference);
      formData.append("amount_paid", String(input.amount_paid));
      if (input.bank_commission !== undefined) {
        formData.append("bank_commission", String(input.bank_commission));
      }
      if (input.notes?.trim()) {
        formData.append("notes", input.notes.trim());
      }
      formData.append("proof", input.proof);
      const result = await api.postForm<PaymentRequest>(`/requests/${requestId}/register-payment`, formData);
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError = e instanceof Error ? e : new Error("Error al registrar pago");
      setError(nextError);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { registerPayment, isLoading, error };
}

export function useBulkMarkPaid() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const bulkMarkPaid = async (input: BulkMarkPaidInput): Promise<BulkMarkPaidResponse> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<BulkMarkPaidResponse>("/requests/bulk/mark-paid", input);
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError = e instanceof Error ? e : new Error("Error al marcar pagos");
      setError(nextError);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { bulkMarkPaid, isLoading, error };
}

export function useCompletePaymentDetails() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const completePaymentDetails = async (paymentId: string, input: CompletePaymentDetailsInput): Promise<PaymentRequest> => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      if (input.proof) formData.append("proof", input.proof);
      if (input.operation_reference?.trim()) formData.append("operation_reference", input.operation_reference.trim());
      if (input.bank_commission !== undefined) formData.append("bank_commission", String(input.bank_commission));
      if (input.notes?.trim()) formData.append("notes", input.notes.trim());
      if (input.proof_document_id?.trim()) formData.append("proof_document_id", input.proof_document_id.trim());
      const result = await api.patchForm<PaymentRequest>(`/request-payments/${paymentId}/details`, formData);
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError = e instanceof Error ? e : new Error("Error al completar datos del pago");
      setError(nextError);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { completePaymentDetails, isLoading, error };
}

export async function attachPaymentProof(paymentId: string, input: AttachPaymentProofInput): Promise<PaymentRequest> {
  const formData = new FormData();
  if (input.proof) formData.append("proof", input.proof);
  if (input.proof_document_id?.trim()) formData.append("proof_document_id", input.proof_document_id.trim());
  if (input.operation_reference?.trim()) formData.append("operation_reference", input.operation_reference.trim());
  if (input.paid_at?.trim()) formData.append("paid_at", input.paid_at.trim());
  if (input.amount_paid !== undefined) formData.append("amount_paid", String(input.amount_paid));
  if (input.notes?.trim()) formData.append("notes", input.notes.trim());
  const result = await api.postForm<PaymentRequest>(`/request-payments/${paymentId}/proofs`, formData);
  invalidateRequestCaches();
  return result;
}

export function useAttachPaymentProof() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const submitPaymentProof = async (paymentId: string, input: AttachPaymentProofInput): Promise<PaymentRequest> => {
    setIsLoading(true);
    setError(null);
    try {
      return await attachPaymentProof(paymentId, input);
    } catch (e) {
      const nextError = e instanceof Error ? e : new Error("Error al asociar comprobante de pago");
      setError(nextError);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { attachPaymentProof: submitPaymentProof, isLoading, error };
}

export function useStartAdvanceSettlement() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const startAdvanceSettlement = async (requestId: string): Promise<StartAdvanceSettlementResponse> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<StartAdvanceSettlementResponse>(getStartAdvanceSettlementPath(requestId));
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError = e instanceof Error ? e : new Error("Error al iniciar la rendición");
      setError(nextError);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { startAdvanceSettlement, isLoading, error };
}

export function useRequest(id?: string) {
  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const hasLoadedRequestRef = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(Boolean(id));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async (options?: RequestResourceRefetchOptions) => {
    if (!id || authIsLoading || !accessToken) return;
    const background = options?.background === true || hasLoadedRequestRef.current;
    setIsInitialLoading(!background);
    setIsRefreshing(background);
    setError(null);
    try {
      setRequest(await api.get<PaymentRequest>(`/requests/${id}`));
      hasLoadedRequestRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar la solicitud"));
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, authIsLoading, id]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, refetch]);

  const patchRequest = (nextRequest: PaymentRequest): void => {
    hasLoadedRequestRef.current = true;
    setRequest(nextRequest);
  };

  return { request, data: request, isInitialLoading, isRefreshing, isLoading: isInitialLoading, error, refetch, patchRequest };
}

export function useSettlementContext(requestId?: string, enabled = true) {
  const [context, setContext] = useState<SettlementContextResponse | null>(null);
  const hasLoadedContextRef = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(Boolean(requestId && enabled));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async (options?: RequestResourceRefetchOptions) => {
    if (!requestId || !enabled || authIsLoading || !accessToken) return;
    const background = options?.background === true || hasLoadedContextRef.current;
    setIsInitialLoading(!background);
    setIsRefreshing(background);
    setError(null);
    try {
      setContext(await api.get<SettlementContextResponse>(getSettlementContextPath(requestId)));
      hasLoadedContextRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar el contexto de rendición"));
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, authIsLoading, enabled, requestId]);

  useEffect(() => {
    if (!requestId || !enabled) {
      setContext(null);
      hasLoadedContextRef.current = false;
      setError(null);
      setIsInitialLoading(false);
      setIsRefreshing(false);
      return;
    }
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, enabled, refetch, requestId]);

  return { context, data: context, isInitialLoading, isRefreshing, isLoading: isInitialLoading, error, refetch };
}

export function useRequestDocuments(requestId?: string) {
  const [documents, setDocuments] = useState<RequestDocument[]>([]);
  const hasLoadedDocumentsRef = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(Boolean(requestId));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async (options?: RequestResourceRefetchOptions) => {
    if (!requestId || authIsLoading || !accessToken) return;
    const background = options?.background === true || hasLoadedDocumentsRef.current;
    setIsInitialLoading(!background);
    setIsRefreshing(background);
    setError(null);
    try {
      setDocuments(await api.get<RequestDocument[]>(`/requests/${requestId}/documents`));
      hasLoadedDocumentsRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar documentos"));
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, authIsLoading, requestId]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, refetch]);

  const upsertDocument = (document: RequestDocument): void => {
    hasLoadedDocumentsRef.current = true;
    setDocuments((current) => upsertById(current, document));
  };
  const removeDocument = (documentId: string): void => setDocuments((current) => current.filter((document) => document.id !== documentId));

  return { documents, data: documents, isInitialLoading, isRefreshing, isLoading: isInitialLoading, error, refetch, upsertDocument, removeDocument };
}

export function useRequestReceiptReviews(requestId?: string) {
  const [receipts, setReceipts] = useState<RequestReceiptReview[]>([]);
  const hasLoadedReceiptsRef = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(Boolean(requestId));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async (options?: RequestResourceRefetchOptions) => {
    if (!requestId || authIsLoading || !accessToken) return;
    const background = options?.background === true || hasLoadedReceiptsRef.current;
    setIsInitialLoading(!background);
    setIsRefreshing(background);
    setError(null);
    try {
      setReceipts(await api.get<RequestReceiptReview[]>(`/requests/${requestId}/receipts`));
      hasLoadedReceiptsRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar lectura automática de comprobantes"));
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, authIsLoading, requestId]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, refetch]);

  const upsertReceipt = (receipt: RequestReceiptReview): void => {
    hasLoadedReceiptsRef.current = true;
    setReceipts((current) => {
      const existingIndex = current.findIndex((candidate) => candidate.receipt.id === receipt.receipt.id);
      if (existingIndex === -1) return [...current, receipt];
      return current.map((candidate, index) => index === existingIndex ? receipt : candidate);
    });
  };

  return { receipts, data: receipts, isInitialLoading, isRefreshing, isLoading: isInitialLoading, error, refetch, upsertReceipt };
}

export function useRequestRenditionReport(requestId?: string, enabled = true) {
  const [report, setReport] = useState<RequestRenditionReport | null>(null);
  const hasLoadedReportRef = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(Boolean(requestId && enabled));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async (options?: RequestResourceRefetchOptions) => {
    if (!requestId || !enabled || authIsLoading || !accessToken) return;
    const background = options?.background === true || hasLoadedReportRef.current;
    setIsInitialLoading(!background);
    setIsRefreshing(background);
    setError(null);
    try {
      setReport(await api.get<RequestRenditionReport>(getRenditionReportPath(requestId)));
      hasLoadedReportRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar informe de rendición"));
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, authIsLoading, enabled, requestId]);

  useEffect(() => {
    if (!requestId || !enabled) {
      setReport(null);
      hasLoadedReportRef.current = false;
      setError(null);
      setIsInitialLoading(false);
      setIsRefreshing(false);
      return;
    }
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, enabled, refetch, requestId]);

  const replaceReport = (nextReport: RequestRenditionReport): void => {
    hasLoadedReportRef.current = true;
    setReport(nextReport);
  };
  const upsertReportRow = (row: RequestRenditionRow): void => {
    hasLoadedReportRef.current = true;
    setReport((current) => current ? { ...current, rows: upsertById(current.rows, row) } : current);
  };
  const removeReportRow = (rowId: string): void => {
    setReport((current) => current ? { ...current, rows: current.rows.filter((row) => row.id !== rowId) } : current);
  };

  return { report, data: report, isInitialLoading, isRefreshing, isLoading: isInitialLoading, error, refetch, replaceReport, upsertReportRow, removeReportRow };
}

export function useRequestRenditionReportActions() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function run<T>(fallbackMessage: string, action: () => Promise<T>): Promise<T> {
    setIsLoading(true);
    setError(null);
    try {
      const result = await action();
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError = e instanceof Error ? e : new Error(fallbackMessage);
      setError(nextError);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }

  return {
    isLoading,
    error,
    addReceiptRow: (requestId: string, receiptId: string, requestAllocationId?: string) => run(
      "Error al agregar comprobante al informe",
      () => api.post<RequestRenditionRow>(`${getRenditionReportPath(requestId)}/rows/from-receipt/${receiptId}`, requestAllocationId ? { request_allocation_id: requestAllocationId } : {}),
    ),
    createManualRow: (requestId: string, input: CreateManualRenditionRowInput) => run(
      "Error al agregar fila manual al informe",
      () => api.post<RequestRenditionRow>(`${getRenditionReportPath(requestId)}/rows/manual`, input),
    ),
    updateRow: (requestId: string, rowId: string, input: UpdateRenditionRowInput) => run(
      "Error al actualizar fila del informe",
      () => api.patch<RequestRenditionRow>(`${getRenditionReportPath(requestId)}/rows/${rowId}`, input),
    ),
    deleteRow: (requestId: string, rowId: string) => run(
      "Error al quitar fila del informe",
      () => api.delete<RequestRenditionRow>(`${getRenditionReportPath(requestId)}/rows/${rowId}`),
    ),
    validateReport: (requestId: string) => run(
      "Error al validar informe de rendición",
      () => api.post<RequestRenditionValidationResponse>(`${getRenditionReportPath(requestId)}/validate`),
    ),
    generateReport: (requestId: string) => run(
      "Error al generar informe de rendición",
      () => api.post<RequestRenditionGenerateResponse>(`${getRenditionReportPath(requestId)}/generate`),
    ),
    upsertLineReturn: (requestId: string, allocationId: string, input: UpsertRenditionLineReturnInput) => run(
      "Error al guardar devolución de línea POA",
      () => api.patch<RequestRenditionReport>(`${getRenditionReportPath(requestId)}/line-returns/${allocationId}`, input),
    ),
    deleteLineReturn: (requestId: string, allocationId: string) => run(
      "Error al quitar devolución de línea POA",
      () => api.delete<{ deleted: true }>(`${getRenditionReportPath(requestId)}/line-returns/${allocationId}`),
    ),
  };
}

export function useUpdateRequestReceiptReview() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const updateReceiptReview = async (
    requestId: string,
    receiptId: string,
    input: UpdateRequestReceiptReviewInput,
  ): Promise<RequestReceiptReview> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.patch<RequestReceiptReview>(`/requests/${requestId}/receipts/${receiptId}`, input);
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError = e instanceof Error ? e : new Error("Error al actualizar datos del comprobante");
      setError(nextError);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateReceiptReview, isLoading, error };
}

export function useConfirmRequestReceiptReview() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const confirmReceiptReview = async (requestId: string, receiptId: string): Promise<RequestReceiptReview> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<RequestReceiptReview>(`/requests/${requestId}/receipts/${receiptId}/confirm`);
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError = e instanceof Error ? e : new Error("Error al confirmar datos del comprobante");
      setError(nextError);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { confirmReceiptReview, isLoading, error };
}

export function useUploadRequestDocument() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const uploadDocument = async (requestId: string, input: UploadRequestDocumentInput): Promise<RequestDocument> => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", input.file);
      formData.append("document_category", input.document_category);
      if (input.scope_type && input.document_category !== REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF) {
        formData.append("scope_type", input.scope_type);
      }
      if (input.request_allocation_id && input.document_category !== REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF) {
        formData.append("request_allocation_id", input.request_allocation_id);
      }
      if (input.document_section) {
        formData.append("document_section", input.document_section);
      }
      if (input.metadata_json) {
        formData.append("metadata_json", JSON.stringify(input.metadata_json));
      }
      const result = await api.postForm<RequestDocument>(`/requests/${requestId}/documents`, formData);
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError = e instanceof Error ? e : new Error("Error al adjuntar documento");
      setError(nextError);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { uploadDocument, isLoading, error };
}

export function useDeleteRequestDocument() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteDocument = async (requestId: string, documentId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await api.delete<void>(`/requests/${requestId}/documents/${documentId}`);
      invalidateRequestCaches();
    } catch (e) {
      const nextError = e instanceof Error ? e : new Error("Error al eliminar documento");
      setError(nextError);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { deleteDocument, isLoading, error };
}

export interface RequestPlanningLineLookupFilters {
  search?: string;
  fiscal_year_id?: string;
  org_unit_id?: string;
  planning_type?: string;
  program_id?: string;
  component_id?: string;
  operative_action_id?: string;
  category_id?: string;
  territory_id?: string;
}

function appendPlanningLineLookupParam(params: URLSearchParams, key: keyof RequestPlanningLineLookupFilters, value?: string): void {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}

export function buildRequestPlanningLinesPath(filters: RequestPlanningLineLookupFilters = {}): string {
  const params = new URLSearchParams();
  appendPlanningLineLookupParam(params, "search", filters.search);
  appendPlanningLineLookupParam(params, "fiscal_year_id", filters.fiscal_year_id);
  appendPlanningLineLookupParam(params, "org_unit_id", filters.org_unit_id);
  appendPlanningLineLookupParam(params, "planning_type", filters.planning_type);
  appendPlanningLineLookupParam(params, "program_id", filters.program_id);
  appendPlanningLineLookupParam(params, "component_id", filters.component_id);
  appendPlanningLineLookupParam(params, "operative_action_id", filters.operative_action_id);
  appendPlanningLineLookupParam(params, "category_id", filters.category_id);
  appendPlanningLineLookupParam(params, "territory_id", filters.territory_id);
  const query = params.toString();
  return `/requests/lookups/planning-lines${query ? `?${query}` : ""}`;
}

export function invalidateRequestCaches(): void {
  invalidateRequestDomain();
}

function normalizeLookupFilters(filters?: RequestPlanningLineLookupFilters | string): RequestPlanningLineLookupFilters {
  return typeof filters === "string" ? { search: filters } : filters ?? {};
}

export function useRequestPlanningLines(filters?: RequestPlanningLineLookupFilters | string) {
  const [data, setData] = useState<RequestPlanningLineLookupResponse | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [forceNonce, setForceNonce] = useState(0);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);
  const lookupFilters = normalizeLookupFilters(filters);
  const lookupKey = stableSerialize(lookupFilters);

  const refetch = useCallback(async (options?: RequestResourceRefetchOptions & { force?: boolean }) => {
    if (options?.force) setForceNonce((current) => current + 1);
    else setRefreshNonce((current) => current + 1);
  }, []);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    let cancelled = false;
    const hasPreviousData = data !== null;
    setIsInitialLoading(!hasPreviousData);
    setIsRefreshing(hasPreviousData);
    setError(null);

    cachedQuery<RequestPlanningLineLookupResponse>({
      key: ["requests", "planning-lines", lookupFilters],
      ttlMs: QUERY_CACHE_TTL_MS.POA_LOOKUP,
      tags: ["requests", "poa", "budget"],
      force: forceNonce > 0,
      queryFn: () => api.get<RequestPlanningLineLookupResponse>(buildRequestPlanningLinesPath(lookupFilters)),
    })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error("Error al cargar líneas POA"));
      })
      .finally(() => {
        if (!cancelled) {
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, authIsLoading, lookupKey, refreshNonce, forceNonce]);

  const normalizedSearch = lookupFilters.search?.trim().toLowerCase() ?? "";
  const lines = (data?.lines ?? []).filter((line) => {
    if (!normalizedSearch) return true;
    return [line.line_code, line.resource_description, line.org_unit?.name, line.program?.name, line.action?.name, line.action?.component?.name, line.category?.name, line.territory?.name]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLowerCase().includes(normalizedSearch));
  });

  return { lines, total: data?.total ?? 0, isLoading: isInitialLoading, isInitialLoading, isRefreshing, error, refetch };
}

export function useBudgetPreview(input: BudgetPreviewInput) {
  const [data, setData] = useState<RequestBudgetPreview | RequestAllocationsBudgetPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const allocationKey = input.allocations?.map((allocation) => `${allocation.budget_planning_line_id}:${allocation.amount}`).join("|") ?? "";
  const validAllocations = input.allocations?.filter((allocation) => allocation.budget_planning_line_id && allocation.amount > 0) ?? [];
  const hasBatchInput = validAllocations.length > 0;
  const hasLegacyInput = Boolean(input.planningLineId && input.amount && input.amount > 0);
  const hasValidInput = hasBatchInput || hasLegacyInput;

  const refetch = useCallback(async () => {
    if (!hasValidInput || authIsLoading || !accessToken) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      if (hasBatchInput) {
        const result = await api.post<RequestAllocationsBudgetPreview>("/requests/lookups/planning-lines/budget-preview", {
          allocations: validAllocations,
          month: input.month,
          request_id: input.requestId,
        });
        setData(result);
        return;
      }

      const params = new URLSearchParams({ amount: String(input.amount) });
      if (input.month) params.set("month", String(input.month));
      if (input.requestId) params.set("request_id", input.requestId);
      const result = await api.get<RequestBudgetPreview>(`/requests/lookups/planning-lines/${input.planningLineId}/budget-preview?${params.toString()}`);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al obtener vista previa presupuestal"));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authIsLoading, allocationKey, hasBatchInput, hasValidInput, input.amount, input.month, input.planningLineId, input.requestId]);

  useEffect(() => {
    if (!hasValidInput) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void refetch();
    }, 500);
    return () => window.clearTimeout(timeoutId);
  }, [hasValidInput, refetch]);

  return { data, isLoading, error, refetch, canPreview: hasValidInput };
}

export function useCreateRequest() {
  const [isLoading, setIsLoading] = useState(false);

  const createRequest = async (dto: CreateRequestDto): Promise<PaymentRequest> => {
    setIsLoading(true);
    try {
      const created = await api.post<PaymentRequest>("/requests", dto);
      invalidateRequestCaches();
      return created;
    } finally {
      setIsLoading(false);
    }
  };

  return { createRequest, isLoading };
}

export function useUpdateRequest() {
  const [isLoading, setIsLoading] = useState(false);

  const updateRequest = async (id: string, dto: UpdateRequestDto): Promise<PaymentRequest> => {
    setIsLoading(true);
    try {
      const updated = await api.patch<PaymentRequest>(`/requests/${id}`, dto);
      invalidateRequestCaches();
      return updated;
    } finally {
      setIsLoading(false);
    }
  };

  return { updateRequest, isLoading };
}

export function useSubmitRequest() {
  const [isLoading, setIsLoading] = useState(false);

  const submitRequest = async (id: string): Promise<PaymentRequest> => {
    setIsLoading(true);
    try {
      const submitted = await api.post<PaymentRequest>(`/requests/${id}/submit`);
      invalidateRequestCaches();
      return submitted;
    } finally {
      setIsLoading(false);
    }
  };

  return { submitRequest, isLoading };
}

export function useObserveRequest() {
  const [isLoading, setIsLoading] = useState(false);

  const observeRequest = async (id: string, dto: ObserveRequestDto): Promise<PaymentRequest> => {
    setIsLoading(true);
    try {
      const observed = await api.post<PaymentRequest>(`/requests/${id}/observe`, dto);
      invalidateRequestCaches();
      return observed;
    } finally {
      setIsLoading(false);
    }
  };

  return { observeRequest, isLoading };
}

export function useApproveRequest() {
  const [isLoading, setIsLoading] = useState(false);

  const approveRequest = async (id: string, dto: ApproveRequestDto = {}): Promise<PaymentRequest> => {
    setIsLoading(true);
    try {
      const approved = await api.post<PaymentRequest>(`/requests/${id}/approve`, dto);
      invalidateRequestCaches();
      return approved;
    } finally {
      setIsLoading(false);
    }
  };

  return { approveRequest, isLoading };
}

export function useRejectRequest() {
  const [isLoading, setIsLoading] = useState(false);

  const rejectRequest = async (id: string, dto: RejectRequestDto): Promise<PaymentRequest> => {
    setIsLoading(true);
    try {
      const rejected = await api.post<PaymentRequest>(`/requests/${id}/reject`, dto);
      invalidateRequestCaches();
      return rejected;
    } finally {
      setIsLoading(false);
    }
  };

  return { rejectRequest, isLoading };
}
