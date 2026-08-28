"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiRequestError } from "@/lib/api-client";
import {
  useCachedResource,
  type CachedResourceCacheMode,
} from "@/hooks/use-cached-resource";
import {
  cachedQuery,
  QUERY_CACHE_TTL_MS,
  stableSerialize,
} from "@/lib/query-cache";
import { QUERY_TAGS, invalidateRequestDomain } from "@/lib/query-tags";
import { useAuthStore } from "@/stores/auth-store";
import { REQUEST_DOCUMENT_CATEGORY } from "@/types/requests";
import { GIOF_WORK_POOL, type GiofWorkLease, type GiofWorkScope } from "@/types/giof-work";
import { isGiofLeaseCurrent } from "@/lib/giof-work-lease-session";
import {
  normalizeRequestReviewFilters,
  serializeRequestReviewUrl,
} from "@/lib/requests";
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
  PaymentQueueResponse,
  RegisterPaymentInput,
  RegisterPaymentResponse,
  RexanActivation,
  RenditionsInboxFilters,
  RenditionsInboxResponse,
  RenditionInboxCounts,
  RequestBudgetPreview,
  RequestAllocationsBudgetPreview,
  RequestPlanningLineLookupResponse,
  RequestPlanningLineFacetsResponse,
  RequestPlanningLineHydrateResponse,
  RequestPlanningLineLookupItem,
  RequestPlanningLineScope,
  RequestPlanningLineSearchItem,
  RequestPlanningLineSearchResponse,
  RequestReviewFilters,
  RequestReviewResponse,
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

function appendIfPresent(
  params: URLSearchParams,
  key: string,
  value: string | number | boolean | undefined,
): void {
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

export interface UseRequestsOptions {
  keepPreviousData?: boolean;
  cacheMode?: CachedResourceCacheMode;
  enabled?: boolean;
}

export const RENDITION_ACTION_TIMEOUT_MS = 30_000;

export class RenditionActionTimeoutError extends Error {
  constructor() {
    super("La operación superó el tiempo de espera y su resultado es incierto.");
    this.name = "RenditionActionTimeoutError";
  }
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const existingIndex = items.findIndex(
    (candidate) => candidate.id === item.id,
  );
  if (existingIndex === -1) return [...items, item];
  return items.map((candidate, index) =>
    index === existingIndex ? item : candidate,
  );
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
  appendIfPresent(
    params,
    "budget_planning_line_id",
    filters?.budget_planning_line_id,
  );
  appendIfPresent(params, "org_unit_id", filters?.org_unit_id);
  appendIfPresent(params, "requester_id", filters?.requester_id);
  appendIfPresent(params, "date_from", filters?.date_from);
  appendIfPresent(params, "date_to", filters?.date_to);
  appendIfPresent(params, "date_field", filters?.date_field);
  appendIfPresent(params, "has_documents", filters?.has_documents);
  appendIfPresent(params, "drive_sync_status", filters?.drive_sync_status);
  appendIfPresent(params, "search", filters?.search);
  appendIfPresent(params, "scope", filters?.scope);
  appendIfPresent(params, "work_scope", filters?.work_scope);
  appendIfPresent(params, "assignee_id", filters?.assignee_id);
  const query = params.toString();
  return `/requests${query ? `?${query}` : ""}`;
}

export function getRequestReviewPath(filters: RequestReviewFilters = {}): string {
  const query = serializeRequestReviewUrl(filters).toString();
  return `/requests/review${query ? `?${query}` : ""}`;
}

export function getRequestReviewQueryKey(
  filters: RequestReviewFilters = {},
): readonly [typeof QUERY_TAGS.REQUESTS, "review", RequestReviewFilters] {
  return [
    QUERY_TAGS.REQUESTS,
    "review",
    normalizeRequestReviewFilters(filters),
  ];
}

export function getPaymentQueuePath(filters?: PaymentQueueFilters): string {
  const params = new URLSearchParams();
  appendIfPresent(params, "page", filters?.page);
  appendIfPresent(params, "limit", filters?.limit);
  appendIfPresent(params, "status", filters?.status);
  appendIfPresent(params, "pending_proof", filters?.pending_proof);
  appendIfPresent(params, "pending_details", filters?.pending_details);
  appendIfPresent(params, "pending_data", filters?.pending_data);
  appendIfPresent(params, "search", filters?.search);
  appendIfPresent(params, "work_scope", filters?.work_scope);
  appendIfPresent(params, "assignee_id", filters?.assignee_id);
  appendIfPresent(params, "approved_from", filters?.approved_from);
  appendIfPresent(params, "approved_to", filters?.approved_to);
  appendIfPresent(params, "paid_from", filters?.paid_from);
  appendIfPresent(params, "paid_to", filters?.paid_to);
  appendIfPresent(params, "source_account_key", filters?.source_account_key);
  appendIfPresent(params, "completeness", filters?.completeness);
  appendIfPresent(params, "drive_status", filters?.drive_status);
  appendIfPresent(params, "rexan_status", filters?.rexan_status);
  appendIfPresent(params, "currency", filters?.currency);
  appendIfPresent(params, "amount_min", filters?.amount_min);
  appendIfPresent(params, "amount_max", filters?.amount_max);
  appendIfPresent(params, "sort", filters?.sort);
  const query = params.toString();
  return `/requests/payment-queue${query ? `?${query}` : ""}`;
}

export function getRenditionsPath(filters?: RenditionsInboxFilters): string {
  const params = new URLSearchParams();
  appendIfPresent(params, "page", filters?.page);
  appendIfPresent(params, "limit", filters?.limit);
  appendIfPresent(params, "status", filters?.status);
  appendIfPresent(params, "search", filters?.search);
  appendIfPresent(params, "due_from", filters?.due_from);
  appendIfPresent(params, "due_to", filters?.due_to);
  appendIfPresent(params, "deadline_from", filters?.deadline_from);
  appendIfPresent(params, "deadline_to", filters?.deadline_to);
  appendIfPresent(params, "deadline_bucket", filters?.deadline_bucket);
  appendIfPresent(params, "bucket", filters?.bucket);
  appendIfPresent(params, "sort", filters?.sort);
  appendIfPresent(params, "direction", filters?.direction);
  appendIfPresent(params, "work_scope", filters?.work_scope);
  appendIfPresent(params, "assignee_id", filters?.assignee_id);
  const query = params.toString();
  return `/requests/renditions${query ? `?${query}` : ""}`;
}

export function getRenditionCountsPath(
  filters?: Omit<
    RenditionsInboxFilters,
    "status" | "bucket" | "page" | "limit"
  >,
): string {
  const params = new URLSearchParams();
  appendIfPresent(params, "search", filters?.search);
  appendIfPresent(params, "due_from", filters?.due_from);
  appendIfPresent(params, "due_to", filters?.due_to);
  appendIfPresent(params, "deadline_from", filters?.deadline_from);
  appendIfPresent(params, "deadline_to", filters?.deadline_to);
  appendIfPresent(params, "sort", filters?.sort);
  appendIfPresent(params, "direction", filters?.direction);
  appendIfPresent(params, "work_scope", filters?.work_scope);
  appendIfPresent(params, "assignee_id", filters?.assignee_id);
  const query = params.toString();
  return `/requests/renditions/counts${query ? `?${query}` : ""}`;
}

type GiofWorkFilterFields = {
  work_scope?: GiofWorkScope;
  assignee_id?: string;
};

export function withoutGiofWorkFilters<T extends GiofWorkFilterFields>(
  filters: T,
): Omit<T, keyof GiofWorkFilterFields> {
  const {
    work_scope: _workScope,
    assignee_id: _assigneeId,
    ...legacyFilters
  } = filters;
  return legacyFilters;
}

function isLegacyGiofFilterRejection(error: unknown): boolean {
  if (!(error instanceof ApiRequestError) || error.status !== 400) return false;
  const messages = Array.isArray(error.body.message)
    ? error.body.message
    : [error.body.message];
  return messages.some((message) =>
    /property (work_scope|assignee_id) should not exist/i.test(message),
  );
}

export async function fetchGiofCompatibleQueue<T>(
  currentRequest: () => Promise<T>,
  legacyRequest: () => Promise<T>,
): Promise<T> {
  try {
    return await currentRequest();
  } catch (error) {
    if (!isLegacyGiofFilterRejection(error)) throw error;
    return legacyRequest();
  }
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

export function useRequests(
  filters?: RequestsListFilters,
  options?: UseRequestsOptions,
) {
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
    enabled: options?.enabled,
    key: [QUERY_TAGS.REQUESTS, "list", filters ?? {}],
    ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
    tags: [QUERY_TAGS.REQUESTS],
    keepPreviousData: options?.keepPreviousData,
    cacheMode: options?.cacheMode,
    errorMessage: "Error al cargar solicitudes",
    queryFn: (signal) =>
      fetchGiofCompatibleQueue(
        () =>
          api.get<RequestsListResponse>(getRequestsPath(filters), { signal }),
        () =>
          api.get<RequestsListResponse>(
            getRequestsPath(
              filters ? withoutGiofWorkFilters(filters) : filters,
            ),
            { signal },
          ),
      ),
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

export function useRequestReview(
  filters: RequestReviewFilters = {},
  options?: UseRequestsOptions,
) {
  const normalizedFilters = normalizeRequestReviewFilters(filters);
  const resource = useCachedResource<RequestReviewResponse>({
    enabled: options?.enabled,
    key: getRequestReviewQueryKey(normalizedFilters),
    ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
    tags: [QUERY_TAGS.REQUESTS],
    keepPreviousData: options?.keepPreviousData,
    cacheMode: options?.cacheMode,
    errorMessage: "Error al cargar solicitudes para revisión",
    queryFn: (signal) =>
      api.get<RequestReviewResponse>(getRequestReviewPath(normalizedFilters), {
        signal,
      }),
  });
  const data = resource.data;

  return {
    requests: data?.requests ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? normalizedFilters.page ?? 1,
    limit: data?.limit ?? normalizedFilters.limit ?? 20,
    summary: data?.summary ?? null,
    isLoading: resource.isLoading,
    isInitialLoading: resource.isInitialLoading,
    isRefreshing: resource.isRefreshing,
    error: resource.error,
    refetch: resource.refetch,
  };
}

export function usePaymentQueue(filters?: PaymentQueueFilters, options?: UseRequestsOptions) {
  const pageFilter = filters?.page;
  const limitFilter = filters?.limit;
  const statusFilter = filters?.status;
  const pendingProofFilter = filters?.pending_proof;
  const pendingDetailsFilter = filters?.pending_details;
  const searchFilter = filters?.search;

  const resource = useCachedResource<PaymentQueueResponse>({
    enabled: options?.enabled,
    key: [QUERY_TAGS.PAYMENTS, "queue", filters ?? {}],
    ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
    tags: [QUERY_TAGS.PAYMENTS, QUERY_TAGS.REQUESTS, QUERY_TAGS.DASHBOARD],
    errorMessage: "Error al cargar cola de pagos",
    queryFn: (signal) => api.get<PaymentQueueResponse>(getPaymentQueuePath(filters), { signal }),
  });
  const data = resource.data;

  return {
    requests: data?.requests ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? pageFilter ?? 1,
    limit: data?.limit ?? limitFilter ?? 20,
    summary: data?.summary ?? null,
    isLoading: resource.isLoading,
    isInitialLoading: resource.isInitialLoading,
    isRefreshing: resource.isRefreshing,
    error: resource.error,
    refetch: resource.refetch,
  };
}

export function useRenditionsInbox(filters?: RenditionsInboxFilters, options?: UseRequestsOptions) {
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
    enabled: options?.enabled,
    key: [QUERY_TAGS.RENDITIONS, "inbox", filters ?? {}],
    ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
    tags: [QUERY_TAGS.RENDITIONS, QUERY_TAGS.REQUESTS, QUERY_TAGS.DASHBOARD],
    errorMessage: "Error al cargar rendiciones",
    queryFn: (signal) =>
      fetchGiofCompatibleQueue(
        () => api.get<RenditionsInboxResponse>(getRenditionsPath(filters), { signal }),
        () =>
          api.get<RenditionsInboxResponse>(
            getRenditionsPath(
              filters ? withoutGiofWorkFilters(filters) : filters,
            ),
            { signal },
          ),
      ),
  });
  const data = resource.data;

  return {
    renditions: data?.renditions ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? pageFilter ?? 1,
    limit: data?.limit ?? limitFilter ?? 20,
    counts: data?.counts,
    summary: data?.summary ?? null,
    facets: data?.facets ?? null,
    isLoading: resource.isLoading,
    isInitialLoading: resource.isInitialLoading,
    isRefreshing: resource.isRefreshing,
    error: resource.error,
    refetch: resource.refetch,
  };
}

export function useRenditionCounts(
  filters?: Omit<
    RenditionsInboxFilters,
    "status" | "bucket" | "page" | "limit"
  >,
) {
  const resource = useCachedResource<RenditionInboxCounts>({
    key: [QUERY_TAGS.RENDITIONS, "counts", filters ?? {}],
    ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
    tags: [QUERY_TAGS.RENDITIONS, QUERY_TAGS.REQUESTS, QUERY_TAGS.DASHBOARD],
    errorMessage: "Error al cargar resumen de rendiciones",
    queryFn: () =>
      fetchGiofCompatibleQueue(
        () => api.get<RenditionInboxCounts>(getRenditionCountsPath(filters)),
        () =>
          api.get<RenditionInboxCounts>(
            getRenditionCountsPath(
              filters ? withoutGiofWorkFilters(filters) : filters,
            ),
          ),
      ),
  });

  return {
    counts: resource.data,
    isLoading: resource.isLoading,
    isInitialLoading: resource.isInitialLoading,
    isRefreshing: resource.isRefreshing,
    error: resource.error,
    refetch: resource.refetch,
  };
}

export function useRegisterPayment() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const registerPayment = async (
    requestId: string,
    input: RegisterPaymentInput,
    operationalContext?: GiofWorkLease,
  ): Promise<RegisterPaymentResponse> => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("paid_at", input.paid_at);
      formData.append("source_account_key", input.source_account_key);
      formData.append("operation_reference", input.operation_reference);
      formData.append("amount_paid", String(input.amount_paid));
      if (input.bank_commission !== undefined) {
        formData.append("bank_commission", String(input.bank_commission));
      }
      if (input.notes?.trim()) {
        formData.append("notes", input.notes.trim());
      }
      formData.append("proof", input.proof);
      if (!operationalContext || !isGiofLeaseCurrent(operationalContext, {
        requestId,
        pool: GIOF_WORK_POOL.PAYMENT,
        assignmentVersion: operationalContext.assignmentVersion,
      })) {
        throw new Error("La sesión de pago no está vigente. Cierra esta ventana y vuelve a Procesar desde la cola.");
      }
      const result = await api.postForm<RegisterPaymentResponse>(
        `/requests/${requestId}/register-payment`,
        formData,
        {
          headers: {
            "x-giof-assignment-version": operationalContext.assignmentVersion,
            "x-giof-lease-token": operationalContext.token,
          },
        },
      );
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError =
        e instanceof Error ? e : new Error("Error al registrar pago");
      setError(nextError);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { registerPayment, isLoading, error };
}

export function useRetryRexanActivation() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const retryRexanActivation = async (
    requestId: string,
  ): Promise<RexanActivation> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<RexanActivation>(
        `/requests/${requestId}/rexan-activation/retry`,
        {},
      );
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError =
        e instanceof Error
          ? e
          : new Error("No se pudo reintentar la activación REXAN");
      setError(nextError);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };
  return { retryRexanActivation, isLoading, error };
}

export function useRetryDrivePaymentProjection() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const retryDrivePaymentProjection = async (
    paymentId: string,
    reason: string,
  ): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await api.post(`/request-payments/${paymentId}/drive-projection/retry`, {
        reason: reason.trim(),
      });
      invalidateRequestCaches();
    } catch (caught) {
      const nextError =
        caught instanceof Error
          ? caught
          : new Error("No se pudo reintentar la proyección de Drive");
      setError(nextError);
      throw caught;
    } finally {
      setIsLoading(false);
    }
  };

  return { retryDrivePaymentProjection, isLoading, error };
}

export function useBulkMarkPaid() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const bulkMarkPaid = async (
    input: BulkMarkPaidInput,
  ): Promise<BulkMarkPaidResponse> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<BulkMarkPaidResponse>(
        "/requests/bulk/register-payments",
        input,
      );
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError =
        e instanceof Error ? e : new Error("Error al marcar pagos");
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

  const completePaymentDetails = async (
    paymentId: string,
    input: CompletePaymentDetailsInput,
  ): Promise<PaymentRequest> => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      if (input.proof) formData.append("proof", input.proof);
      if (input.source_account_key)
        formData.append("source_account_key", input.source_account_key);
      if (input.operation_reference?.trim())
        formData.append(
          "operation_reference",
          input.operation_reference.trim(),
        );
      if (input.bank_commission !== undefined)
        formData.append("bank_commission", String(input.bank_commission));
      if (input.notes?.trim()) formData.append("notes", input.notes.trim());
      if (input.proof_document_id?.trim())
        formData.append("proof_document_id", input.proof_document_id.trim());
      const result = await api.patchForm<PaymentRequest>(
        `/request-payments/${paymentId}/details`,
        formData,
      );
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError =
        e instanceof Error ? e : new Error("Error al completar datos del pago");
      setError(nextError);
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { completePaymentDetails, isLoading, error };
}

export async function attachPaymentProof(
  paymentId: string,
  input: AttachPaymentProofInput,
): Promise<PaymentRequest> {
  const formData = new FormData();
  if (input.proof) formData.append("proof", input.proof);
  if (input.proof_document_id?.trim())
    formData.append("proof_document_id", input.proof_document_id.trim());
  if (input.operation_reference?.trim())
    formData.append("operation_reference", input.operation_reference.trim());
  if (input.paid_at?.trim()) formData.append("paid_at", input.paid_at.trim());
  if (input.amount_paid !== undefined)
    formData.append("amount_paid", String(input.amount_paid));
  if (input.notes?.trim()) formData.append("notes", input.notes.trim());
  const result = await api.postForm<PaymentRequest>(
    `/request-payments/${paymentId}/proofs`,
    formData,
  );
  invalidateRequestCaches();
  return result;
}

export function useAttachPaymentProof() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const submitPaymentProof = async (
    paymentId: string,
    input: AttachPaymentProofInput,
  ): Promise<PaymentRequest> => {
    setIsLoading(true);
    setError(null);
    try {
      return await attachPaymentProof(paymentId, input);
    } catch (e) {
      const nextError =
        e instanceof Error
          ? e
          : new Error("Error al guardar la constancia de pago");
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

  const startAdvanceSettlement = async (
    requestId: string,
  ): Promise<StartAdvanceSettlementResponse> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<StartAdvanceSettlementResponse>(
        getStartAdvanceSettlementPath(requestId),
      );
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError =
        e instanceof Error ? e : new Error("Error al iniciar la rendición");
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
  const rexanPollCountRef = useRef(0);
  const [isInitialLoading, setIsInitialLoading] = useState(Boolean(id));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(
    async (options?: RequestResourceRefetchOptions) => {
      if (!id || authIsLoading || !accessToken) return;
      const background =
        options?.background === true || hasLoadedRequestRef.current;
      setIsInitialLoading(!background);
      setIsRefreshing(background);
      setError(null);
      try {
        setRequest(await api.get<PaymentRequest>(`/requests/${id}`));
        hasLoadedRequestRef.current = true;
      } catch (e) {
        setError(
          e instanceof Error ? e : new Error("Error al cargar la solicitud"),
        );
      } finally {
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, authIsLoading, id],
  );

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, refetch]);

  useEffect(() => {
    const status = request?.rexan_activation?.status;
    const shouldPoll =
      status === "PENDING" || status === "PROCESSING" || status === "RETRYING";
    if (!shouldPoll || rexanPollCountRef.current >= 10) {
      if (!shouldPoll) rexanPollCountRef.current = 0;
      return;
    }
    const timer = window.setTimeout(() => {
      rexanPollCountRef.current += 1;
      void refetch({ background: true });
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [
    refetch,
    request?.rexan_activation?.attempt_count,
    request?.rexan_activation?.status,
  ]);

  const patchRequest = (nextRequest: PaymentRequest): void => {
    hasLoadedRequestRef.current = true;
    setRequest(nextRequest);
  };

  return {
    request,
    data: request,
    isInitialLoading,
    isRefreshing,
    isLoading: isInitialLoading,
    error,
    refetch,
    patchRequest,
  };
}

export function useSettlementContext(requestId?: string, enabled = true) {
  const [context, setContext] = useState<SettlementContextResponse | null>(
    null,
  );
  const hasLoadedContextRef = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(
    Boolean(requestId && enabled),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(
    async (options?: RequestResourceRefetchOptions) => {
      if (!requestId || !enabled || authIsLoading || !accessToken) return;
      const background =
        options?.background === true || hasLoadedContextRef.current;
      setIsInitialLoading(!background);
      setIsRefreshing(background);
      setError(null);
      try {
        setContext(
          await api.get<SettlementContextResponse>(
            getSettlementContextPath(requestId),
          ),
        );
        hasLoadedContextRef.current = true;
      } catch (e) {
        setError(
          e instanceof Error
            ? e
            : new Error("Error al cargar el contexto de rendición"),
        );
      } finally {
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, authIsLoading, enabled, requestId],
  );

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

  return {
    context,
    data: context,
    isInitialLoading,
    isRefreshing,
    isLoading: isInitialLoading,
    error,
    refetch,
  };
}

export function useRequestDocuments(requestId?: string) {
  const [documents, setDocuments] = useState<RequestDocument[]>([]);
  const hasLoadedDocumentsRef = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(Boolean(requestId));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(
    async (options?: RequestResourceRefetchOptions) => {
      if (!requestId || authIsLoading || !accessToken) return;
      const background =
        options?.background === true || hasLoadedDocumentsRef.current;
      setIsInitialLoading(!background);
      setIsRefreshing(background);
      setError(null);
      try {
        setDocuments(
          await api.get<RequestDocument[]>(`/requests/${requestId}/documents`),
        );
        hasLoadedDocumentsRef.current = true;
      } catch (e) {
        setError(
          e instanceof Error ? e : new Error("Error al cargar documentos"),
        );
      } finally {
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, authIsLoading, requestId],
  );

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, refetch]);

  const upsertDocument = (document: RequestDocument): void => {
    hasLoadedDocumentsRef.current = true;
    setDocuments((current) => upsertById(current, document));
  };
  const removeDocument = (documentId: string): void =>
    setDocuments((current) =>
      current.filter((document) => document.id !== documentId),
    );

  return {
    documents,
    data: documents,
    isInitialLoading,
    isRefreshing,
    isLoading: isInitialLoading,
    error,
    refetch,
    upsertDocument,
    removeDocument,
  };
}

export function useRequestReceiptReviews(requestId?: string) {
  const [receipts, setReceipts] = useState<RequestReceiptReview[]>([]);
  const hasLoadedReceiptsRef = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(Boolean(requestId));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(
    async (options?: RequestResourceRefetchOptions) => {
      if (!requestId || authIsLoading || !accessToken) return;
      const background =
        options?.background === true || hasLoadedReceiptsRef.current;
      setIsInitialLoading(!background);
      setIsRefreshing(background);
      setError(null);
      try {
        setReceipts(
          await api.get<RequestReceiptReview[]>(
            `/requests/${requestId}/receipts`,
          ),
        );
        hasLoadedReceiptsRef.current = true;
      } catch (e) {
        setError(
          e instanceof Error
            ? e
            : new Error("Error al cargar lectura automática de comprobantes"),
        );
      } finally {
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, authIsLoading, requestId],
  );

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, refetch]);

  const upsertReceipt = (receipt: RequestReceiptReview): void => {
    hasLoadedReceiptsRef.current = true;
    setReceipts((current) => {
      const existingIndex = current.findIndex(
        (candidate) => candidate.receipt.id === receipt.receipt.id,
      );
      if (existingIndex === -1) return [...current, receipt];
      return current.map((candidate, index) =>
        index === existingIndex ? receipt : candidate,
      );
    });
  };

  return {
    receipts,
    data: receipts,
    isInitialLoading,
    isRefreshing,
    isLoading: isInitialLoading,
    error,
    refetch,
    upsertReceipt,
  };
}

export function useRequestRenditionReport(requestId?: string, enabled = true) {
  const [report, setReport] = useState<RequestRenditionReport | null>(null);
  const hasLoadedReportRef = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(
    Boolean(requestId && enabled),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const fetchReport = useCallback(
    async (options?: RequestResourceRefetchOptions, throwOnError = false) => {
      if (!requestId || !enabled || authIsLoading || !accessToken) return;
      const background =
        options?.background === true || hasLoadedReportRef.current;
      setIsInitialLoading(!background);
      setIsRefreshing(background);
      setError(null);
      try {
        setReport(
          await api.get<RequestRenditionReport>(
            getRenditionReportPath(requestId),
          ),
        );
        hasLoadedReportRef.current = true;
      } catch (e) {
        const nextError = e instanceof Error
          ? e
          : new Error("Error al cargar informe de rendición");
        setError(nextError);
        if (throwOnError) throw nextError;
      } finally {
        setIsInitialLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken, authIsLoading, enabled, requestId],
  );

  const refetch = useCallback(
    (options?: RequestResourceRefetchOptions) => fetchReport(options),
    [fetchReport],
  );

  const refetchOrThrow = useCallback(
    (options?: RequestResourceRefetchOptions) => fetchReport(options, true),
    [fetchReport],
  );

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
    setReport((current) =>
      current ? { ...current, rows: upsertById(current.rows, row) } : current,
    );
  };
  const removeReportRow = (rowId: string): void => {
    setReport((current) =>
      current
        ? { ...current, rows: current.rows.filter((row) => row.id !== rowId) }
        : current,
    );
  };

  return {
    report,
    data: report,
    isInitialLoading,
    isRefreshing,
    isLoading: isInitialLoading,
    error,
    refetch,
    refetchOrThrow,
    replaceReport,
    upsertReportRow,
    removeReportRow,
  };
}

export function useRequestRenditionReportActions() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function run<T>(
    fallbackMessage: string,
    action: () => Promise<T>,
  ): Promise<T> {
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

  async function runWithTimeout<T>(
    fallbackMessage: string,
    action: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const signal = AbortSignal.timeout(RENDITION_ACTION_TIMEOUT_MS);
    return run(fallbackMessage, async () => {
      try {
        return await action(signal);
      } catch (error) {
        if (signal.aborted || (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError"))) {
          throw new RenditionActionTimeoutError();
        }
        throw error;
      }
    });
  }

  return {
    isLoading,
    error,
    addReceiptRow: (
      requestId: string,
      receiptId: string,
      requestAllocationId?: string,
    ) =>
      runWithTimeout("Error al agregar comprobante al informe", (signal) =>
        api.post<RequestRenditionRow>(
          `${getRenditionReportPath(requestId)}/rows/from-receipt/${receiptId}`,
          requestAllocationId
            ? { request_allocation_id: requestAllocationId }
            : {},
          { signal },
        ),
      ),
    createManualRow: (
      requestId: string,
      input: CreateManualRenditionRowInput,
    ) =>
      run("Error al agregar fila manual al informe", () =>
        api.post<RequestRenditionRow>(
          `${getRenditionReportPath(requestId)}/rows/manual`,
          input,
        ),
      ),
    updateRow: (
      requestId: string,
      rowId: string,
      input: UpdateRenditionRowInput,
    ) =>
      run("Error al actualizar fila del informe", () =>
        api.patch<RequestRenditionRow>(
          `${getRenditionReportPath(requestId)}/rows/${rowId}`,
          input,
        ),
      ),
    deleteRow: (requestId: string, rowId: string) =>
      run("Error al quitar fila del informe", () =>
        api.delete<RequestRenditionRow>(
          `${getRenditionReportPath(requestId)}/rows/${rowId}`,
        ),
      ),
    validateReport: (requestId: string) =>
      run("Error al validar informe de rendición", () =>
        api.post<RequestRenditionValidationResponse>(
          `${getRenditionReportPath(requestId)}/validate`,
        ),
      ),
    generateReport: (requestId: string) =>
      runWithTimeout("Error al generar informe de rendición", (signal) =>
        api.post<RequestRenditionGenerateResponse>(
          `${getRenditionReportPath(requestId)}/generate`,
          undefined,
          { signal },
        ),
      ),
    upsertLineReturn: (
      requestId: string,
      allocationId: string,
      input: UpsertRenditionLineReturnInput,
    ) =>
      run("Error al guardar devolución de línea POA", () =>
        api.patch<RequestRenditionReport>(
          `${getRenditionReportPath(requestId)}/line-returns/${allocationId}`,
          input,
        ),
      ),
    deleteLineReturn: (requestId: string, allocationId: string) =>
      run("Error al quitar devolución de línea POA", () =>
        api.delete<{ deleted: true }>(
          `${getRenditionReportPath(requestId)}/line-returns/${allocationId}`,
        ),
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
      const result = await api.patch<RequestReceiptReview>(
        `/requests/${requestId}/receipts/${receiptId}`,
        input,
      );
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError =
        e instanceof Error
          ? e
          : new Error("Error al actualizar datos del comprobante");
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

  const confirmReceiptReview = async (
    requestId: string,
    receiptId: string,
  ): Promise<RequestReceiptReview> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.post<RequestReceiptReview>(
        `/requests/${requestId}/receipts/${receiptId}/confirm`,
      );
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError =
        e instanceof Error
          ? e
          : new Error("Error al confirmar datos del comprobante");
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

  const uploadDocument = async (
    requestId: string,
    input: UploadRequestDocumentInput,
  ): Promise<RequestDocument> => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", input.file);
      formData.append("document_category", input.document_category);
      if (
        input.scope_type &&
        input.document_category !== REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF
      ) {
        formData.append("scope_type", input.scope_type);
      }
      if (
        input.request_allocation_id &&
        input.document_category !== REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF
      ) {
        formData.append("request_allocation_id", input.request_allocation_id);
      }
      if (input.document_section) {
        formData.append("document_section", input.document_section);
      }
      if (input.metadata_json) {
        formData.append("metadata_json", JSON.stringify(input.metadata_json));
      }
      const result = await api.postForm<RequestDocument>(
        `/requests/${requestId}/documents`,
        formData,
      );
      invalidateRequestCaches();
      return result;
    } catch (e) {
      const nextError =
        e instanceof Error ? e : new Error("Error al adjuntar documento");
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

  const deleteDocument = async (
    requestId: string,
    documentId: string,
  ): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      await api.delete<void>(`/requests/${requestId}/documents/${documentId}`);
      invalidateRequestCaches();
    } catch (e) {
      const nextError =
        e instanceof Error ? e : new Error("Error al eliminar documento");
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
  scope?: RequestPlanningLineScope;
}

function appendPlanningLineLookupParam(
  params: URLSearchParams,
  key: keyof RequestPlanningLineLookupFilters,
  value?: string,
): void {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}

export function buildRequestPlanningLinesPath(
  filters: RequestPlanningLineLookupFilters = {},
): string {
  const params = new URLSearchParams();
  appendPlanningLineLookupParam(params, "search", filters.search);
  appendPlanningLineLookupParam(
    params,
    "fiscal_year_id",
    filters.fiscal_year_id,
  );
  appendPlanningLineLookupParam(params, "org_unit_id", filters.org_unit_id);
  appendPlanningLineLookupParam(params, "planning_type", filters.planning_type);
  appendPlanningLineLookupParam(params, "program_id", filters.program_id);
  appendPlanningLineLookupParam(params, "component_id", filters.component_id);
  appendPlanningLineLookupParam(
    params,
    "operative_action_id",
    filters.operative_action_id,
  );
  appendPlanningLineLookupParam(params, "category_id", filters.category_id);
  appendPlanningLineLookupParam(params, "territory_id", filters.territory_id);
  appendPlanningLineLookupParam(params, "scope", filters.scope);
  const query = params.toString();
  return `/requests/lookups/planning-lines${query ? `?${query}` : ""}`;
}

export function invalidateRequestCaches(): void {
  invalidateRequestDomain();
}

function normalizeLookupFilters(
  filters?: RequestPlanningLineLookupFilters | string,
): RequestPlanningLineLookupFilters {
  return typeof filters === "string" ? { search: filters } : (filters ?? {});
}

export function useRequestPlanningLines(
  filters?: RequestPlanningLineLookupFilters | string,
) {
  const [data, setData] = useState<RequestPlanningLineLookupResponse | null>(
    null,
  );
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [forceNonce, setForceNonce] = useState(0);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);
  const lookupFilters = normalizeLookupFilters(filters);
  const lookupKey = stableSerialize(lookupFilters);

  const refetch = useCallback(
    async (options?: RequestResourceRefetchOptions & { force?: boolean }) => {
      if (options?.force) setForceNonce((current) => current + 1);
      else setRefreshNonce((current) => current + 1);
    },
    [],
  );

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
      queryFn: () =>
        api.get<RequestPlanningLineLookupResponse>(
          buildRequestPlanningLinesPath(lookupFilters),
        ),
    })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e : new Error("Error al cargar líneas POA"),
          );
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
    return [
      line.line_code,
      line.resource_description,
      line.org_unit?.name,
      line.program?.name,
      line.action?.name,
      line.action?.component?.name,
      line.category?.name,
      line.territory?.name,
    ]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLowerCase().includes(normalizedSearch));
  });

  return {
    lines,
    total: data?.total ?? 0,
    isLoading: isInitialLoading,
    isInitialLoading,
    isRefreshing,
    error,
    refetch,
  };
}

export interface RequestPlanningLineSearchFilters extends RequestPlanningLineLookupFilters {
  page?: number;
  limit?: number;
}

function mapLightPlanningLine(
  item: RequestPlanningLineSearchItem,
): RequestPlanningLineLookupItem {
  return {
    id: item.id,
    line_code: item.line_code,
    resource_description: item.resource_description,
    planning_type: item.planning_type,
    type_resource: null,
    unit_price: null,
    quantity: null,
    total_cost: 0,
    status: "APPROVED",
    fiscal_year: item.fiscal_year
      ? { ...item.fiscal_year, status: "ACTIVE" }
      : null,
    org_unit: item.org_unit,
    program: item.program,
    action: item.operative_action
      ? { ...item.operative_action, component: item.component }
      : null,
    category: item.category,
    territory: item.territory,
    monthly_summary: [],
  };
}

function buildLightPlanningLinesPath(
  endpoint: "search" | "facets",
  filters: RequestPlanningLineSearchFilters,
): string {
  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(filters)) {
    if (rawValue === undefined || rawValue === null || rawValue === "")
      continue;
    params.set(key, String(rawValue).trim());
  }
  return `/requests/lookups/planning-lines/${endpoint}?${params.toString()}`;
}

export function useRequestPlanningLineSearch(
  filters: RequestPlanningLineSearchFilters,
  enabled: boolean,
) {
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<RequestPlanningLineLookupItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const requestToken = useRef(0);
  const normalizedSearch = filters.search?.trim().toLowerCase() ?? "";
  const filterKey = stableSerialize({
    ...filters,
    search: undefined,
    page: undefined,
  });

  useEffect(() => {
    if (normalizedSearch.length === 1) {
      setDebouncedSearch(normalizedSearch);
      setItems([]);
      setTotal(0);
      setHasMore(false);
      return;
    }
    const timeoutId = window.setTimeout(
      () => setDebouncedSearch(normalizedSearch),
      300,
    );
    return () => window.clearTimeout(timeoutId);
  }, [normalizedSearch]);

  useEffect(() => {
    setPage(1);
    setItems([]);
    setTotal(0);
    setHasMore(false);
  }, [debouncedSearch, filterKey]);

  useEffect(() => {
    if (!enabled || debouncedSearch.length === 1) return;
    const controller = new AbortController();
    const token = ++requestToken.current;
    const hasPrevious = items.length > 0 && page === 1;
    setIsLoading(!hasPrevious);
    setIsRefreshing(hasPrevious);
    setError(null);
    const requestFilters = {
      ...filters,
      search: debouncedSearch || undefined,
      page,
      limit: Math.min(filters.limit ?? 25, 50),
    };

    void cachedQuery<RequestPlanningLineSearchResponse>({
      key: ["requests", "planning-lines", "search", requestFilters],
      ttlMs: QUERY_CACHE_TTL_MS.POA_LOOKUP,
      tags: ["requests", "poa", "budget"],
      force: retryNonce > 0,
      signal: controller.signal,
      queryFn: (signal) =>
        api.get<RequestPlanningLineSearchResponse>(
          buildLightPlanningLinesPath("search", requestFilters),
          { signal },
        ),
    })
      .then((result) => {
        if (token !== requestToken.current) return;
        const nextItems = result.items.map(mapLightPlanningLine);
        setItems((current) => {
          if (page === 1) return nextItems;
          const byId = new Map(current.map((item) => [item.id, item]));
          nextItems.forEach((item) => byId.set(item.id, item));
          return [...byId.values()];
        });
        setTotal(result.total);
        setHasMore(result.has_more);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || token !== requestToken.current) return;
        setError(
          reason instanceof Error
            ? reason
            : new Error("Error al buscar líneas POA"),
        );
      })
      .finally(() => {
        if (token !== requestToken.current) return;
        setIsLoading(false);
        setIsRefreshing(false);
      });

    return () => controller.abort();
  }, [enabled, debouncedSearch, filterKey, page, retryNonce]);

  return {
    items,
    total,
    hasMore,
    isLoading,
    isRefreshing,
    error,
    loadMore: () => hasMore && !isLoading && setPage((current) => current + 1),
    retry: () => setRetryNonce((current) => current + 1),
  };
}

export function useRequestPlanningLineFacets(
  filters: RequestPlanningLineLookupFilters,
  enabled: boolean,
) {
  const [data, setData] = useState<RequestPlanningLineFacetsResponse | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const key = stableSerialize(filters);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    void cachedQuery<RequestPlanningLineFacetsResponse>({
      key: ["requests", "planning-lines", "facets", filters],
      ttlMs: QUERY_CACHE_TTL_MS.POA_LOOKUP,
      tags: ["requests", "poa", "budget"],
      signal: controller.signal,
      queryFn: (signal) =>
        api.get<RequestPlanningLineFacetsResponse>(
          buildLightPlanningLinesPath("facets", filters),
          { signal },
        ),
    })
      .then(setData)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason
              : new Error("Error al cargar filtros POA"),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [enabled, key]);

  return { data, isLoading, error };
}

export function useHydrateRequestPlanningLines(ids: string[]) {
  const [items, setItems] = useState<RequestPlanningLineLookupItem[]>([]);
  const [unavailableIds, setUnavailableIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const idsKey = ids.join("|");

  useEffect(() => {
    if (ids.length === 0) {
      setItems([]);
      setUnavailableIds([]);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    void cachedQuery<RequestPlanningLineHydrateResponse>({
      key: ["requests", "planning-lines", "hydrate", ids],
      ttlMs: QUERY_CACHE_TTL_MS.POA_LOOKUP,
      tags: ["requests", "poa", "budget"],
      force: retryNonce > 0,
      signal: controller.signal,
      queryFn: (signal) =>
        api.post<RequestPlanningLineHydrateResponse>(
          "/requests/lookups/planning-lines/hydrate",
          { ids },
          { signal },
        ),
    })
      .then((result) => {
        setItems(result.items.map(mapLightPlanningLine));
        setUnavailableIds(result.unavailable_ids);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason
              : new Error("Error al recuperar líneas POA seleccionadas"),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [idsKey, retryNonce]);

  return {
    items,
    unavailableIds,
    isLoading,
    error,
    retry: () => setRetryNonce((current) => current + 1),
  };
}

export function useBudgetPreview(input: BudgetPreviewInput) {
  const [data, setData] = useState<
    RequestBudgetPreview | RequestAllocationsBudgetPreview | null
  >(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const allocationKey =
    input.allocations
      ?.map(
        (allocation) =>
          `${allocation.budget_planning_line_id}:${allocation.amount}`,
      )
      .join("|") ?? "";
  const validAllocations =
    input.allocations?.filter(
      (allocation) =>
        allocation.budget_planning_line_id && allocation.amount > 0,
    ) ?? [];
  const hasBatchInput = validAllocations.length > 0;
  const hasLegacyInput = Boolean(
    input.planningLineId && input.amount && input.amount > 0,
  );
  const hasValidInput = hasBatchInput || hasLegacyInput;

  const refetch = useCallback(async () => {
    if (!hasValidInput || authIsLoading || !accessToken) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      if (hasBatchInput) {
        const result = await api.post<RequestAllocationsBudgetPreview>(
          "/requests/lookups/planning-lines/budget-preview",
          {
            allocations: validAllocations,
            month: input.month,
            request_id: input.requestId,
          },
        );
        setData(result);
        return;
      }

      const params = new URLSearchParams({ amount: String(input.amount) });
      if (input.month) params.set("month", String(input.month));
      if (input.requestId) params.set("request_id", input.requestId);
      const result = await api.get<RequestBudgetPreview>(
        `/requests/lookups/planning-lines/${input.planningLineId}/budget-preview?${params.toString()}`,
      );
      setData(result);
    } catch (e) {
      setError(
        e instanceof Error
          ? e
          : new Error("Error al obtener vista previa presupuestal"),
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    accessToken,
    authIsLoading,
    allocationKey,
    hasBatchInput,
    hasValidInput,
    input.amount,
    input.month,
    input.planningLineId,
    input.requestId,
  ]);

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

  const createRequest = async (
    dto: CreateRequestDto,
  ): Promise<PaymentRequest> => {
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

  const updateRequest = async (
    id: string,
    dto: UpdateRequestDto,
  ): Promise<PaymentRequest> => {
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
      const submitted = await api.post<PaymentRequest>(
        `/requests/${id}/submit`,
      );
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

  const observeRequest = async (
    id: string,
    dto: ObserveRequestDto,
  ): Promise<PaymentRequest> => {
    setIsLoading(true);
    try {
      const observed = await api.post<PaymentRequest>(
        `/requests/${id}/observe`,
        dto,
      );
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

  const approveRequest = async (
    id: string,
    dto: ApproveRequestDto = {},
  ): Promise<PaymentRequest> => {
    setIsLoading(true);
    try {
      const approved = await api.post<PaymentRequest>(
        `/requests/${id}/approve`,
        dto,
      );
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

  const rejectRequest = async (
    id: string,
    dto: RejectRequestDto,
  ): Promise<PaymentRequest> => {
    setIsLoading(true);
    try {
      const rejected = await api.post<PaymentRequest>(
        `/requests/${id}/reject`,
        dto,
      );
      invalidateRequestCaches();
      return rejected;
    } finally {
      setIsLoading(false);
    }
  };

  return { rejectRequest, isLoading };
}
