"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type {
  BudgetPreviewInput,
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
  RequestPlanningLineLookupResponse,
  RequestDocument,
  StartAdvanceSettlementResponse,
  UploadRequestDocumentInput,
  RejectRequestDto,
  RequestsListFilters,
  RequestsListResponse,
  UpdateRequestDto,
} from "@/types/requests";

function appendIfPresent(params: URLSearchParams, key: string, value: string | number | undefined): void {
  if (value !== undefined && value !== "") {
    params.set(key, String(value));
  }
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
  appendIfPresent(params, "search", filters?.search);
  const query = params.toString();
  return `/requests${query ? `?${query}` : ""}`;
}

export function getPaymentQueuePath(filters?: PaymentQueueFilters): string {
  const params = new URLSearchParams();
  appendIfPresent(params, "page", filters?.page);
  appendIfPresent(params, "limit", filters?.limit);
  appendIfPresent(params, "status", filters?.status);
  appendIfPresent(params, "search", filters?.search);
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
  appendIfPresent(params, "sort", filters?.sort);
  appendIfPresent(params, "direction", filters?.direction);
  const query = params.toString();
  return `/requests/renditions${query ? `?${query}` : ""}`;
}

export function getRenditionCountsPath(filters?: Omit<RenditionsInboxFilters, "status" | "page" | "limit">): string {
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

export function useRequests(filters?: RequestsListFilters) {
  const [data, setData] = useState<RequestsListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const pageFilter = filters?.page;
  const limitFilter = filters?.limit;
  const statusFilter = filters?.status;
  const statusesFilter = filters?.statuses?.join(",") ?? "";
  const requestTypeFilter = filters?.request_type;
  const planningLineFilter = filters?.budget_planning_line_id;
  const orgUnitFilter = filters?.org_unit_id;
  const searchFilter = filters?.search;

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async () => {
    if (authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<RequestsListResponse>(getRequestsPath(filters));
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar solicitudes"));
    } finally {
      setIsLoading(false);
    }
  }, [
    accessToken,
    authIsLoading,
    pageFilter,
    limitFilter,
    statusFilter,
    statusesFilter,
    requestTypeFilter,
    planningLineFilter,
    orgUnitFilter,
    searchFilter,
  ]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, refetch]);

  return {
    requests: data?.requests ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? pageFilter ?? 1,
    limit: data?.limit ?? limitFilter ?? 20,
    isLoading,
    error,
    refetch,
  };
}

export function usePaymentQueue(filters?: PaymentQueueFilters) {
  const [data, setData] = useState<RequestsListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const pageFilter = filters?.page;
  const limitFilter = filters?.limit;
  const statusFilter = filters?.status;
  const searchFilter = filters?.search;

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async () => {
    if (authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<RequestsListResponse>(getPaymentQueuePath(filters));
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar cola de pagos"));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authIsLoading, pageFilter, limitFilter, statusFilter, searchFilter]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, refetch]);

  return {
    requests: data?.requests ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? pageFilter ?? 1,
    limit: data?.limit ?? limitFilter ?? 20,
    isLoading,
    error,
    refetch,
  };
}

export function useRenditionsInbox(filters?: RenditionsInboxFilters) {
  const [data, setData] = useState<RenditionsInboxResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const pageFilter = filters?.page;
  const limitFilter = filters?.limit;
  const statusFilter = filters?.status;
  const searchFilter = filters?.search;
  const dueFromFilter = filters?.due_from;
  const dueToFilter = filters?.due_to;
  const sortFilter = filters?.sort;
  const directionFilter = filters?.direction;

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async () => {
    if (authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<RenditionsInboxResponse>(getRenditionsPath(filters));
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar rendiciones"));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authIsLoading, pageFilter, limitFilter, statusFilter, searchFilter, dueFromFilter, dueToFilter, sortFilter, directionFilter]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, refetch]);

  return {
    renditions: data?.renditions ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? pageFilter ?? 1,
    limit: data?.limit ?? limitFilter ?? 20,
    counts: data?.counts,
    isLoading,
    error,
    refetch,
  };
}

export function useRenditionCounts(filters?: Omit<RenditionsInboxFilters, "status" | "page" | "limit">) {
  const [counts, setCounts] = useState<RenditionInboxCounts | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const searchFilter = filters?.search;
  const dueFromFilter = filters?.due_from;
  const dueToFilter = filters?.due_to;
  const sortFilter = filters?.sort;
  const directionFilter = filters?.direction;

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async () => {
    if (authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      setCounts(await api.get<RenditionInboxCounts>(getRenditionCountsPath(filters)));
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar resumen de rendiciones"));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authIsLoading, searchFilter, dueFromFilter, dueToFilter, sortFilter, directionFilter]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, refetch]);

  return { counts, isLoading, error, refetch };
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
      return await api.postForm<PaymentRequest>(`/requests/${requestId}/register-payment`, formData);
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

export function useStartAdvanceSettlement() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const startAdvanceSettlement = async (requestId: string): Promise<StartAdvanceSettlementResponse> => {
    setIsLoading(true);
    setError(null);
    try {
      return await api.post<StartAdvanceSettlementResponse>(getStartAdvanceSettlementPath(requestId));
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
  const [isLoading, setIsLoading] = useState(Boolean(id));
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async () => {
    if (!id || authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      setRequest(await api.get<PaymentRequest>(`/requests/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar la solicitud"));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authIsLoading, id]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, refetch]);

  return { request, isLoading, error, refetch };
}

export function useRequestDocuments(requestId?: string) {
  const [documents, setDocuments] = useState<RequestDocument[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(requestId));
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async () => {
    if (!requestId || authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      setDocuments(await api.get<RequestDocument[]>(`/requests/${requestId}/documents`));
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar documentos"));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authIsLoading, requestId]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, refetch]);

  return { documents, isLoading, error, refetch };
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
      if (input.metadata_json) {
        formData.append("metadata_json", JSON.stringify(input.metadata_json));
      }
      return await api.postForm<RequestDocument>(`/requests/${requestId}/documents`, formData);
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

export function useRequestPlanningLines(search?: string) {
  const [data, setData] = useState<RequestPlanningLineLookupResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async () => {
    if (authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<RequestPlanningLineLookupResponse>("/requests/lookups/planning-lines");
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar líneas POA"));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authIsLoading]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [accessToken, authIsLoading, refetch]);

  const normalizedSearch = search?.trim().toLowerCase() ?? "";
  const lines = (data?.lines ?? []).filter((line) => {
    if (!normalizedSearch) return true;
    return [line.line_code, line.resource_description, line.org_unit?.name, line.program?.name]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLowerCase().includes(normalizedSearch));
  });

  return { lines, total: data?.total ?? 0, isLoading, error, refetch };
}

export function useBudgetPreview(input: BudgetPreviewInput) {
  const [data, setData] = useState<RequestBudgetPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const hasValidInput = Boolean(
    input.planningLineId && input.month && input.month >= 1 && input.month <= 12 && input.amount && input.amount > 0,
  );

  const refetch = useCallback(async () => {
    if (!hasValidInput || !input.planningLineId || !input.month || !input.amount || authIsLoading || !accessToken) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ month: String(input.month), amount: String(input.amount) });
      const result = await api.get<RequestBudgetPreview>(
        `/requests/lookups/planning-lines/${input.planningLineId}/budget-preview?${params.toString()}`,
      );
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al obtener vista previa presupuestal"));
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authIsLoading, hasValidInput, input.amount, input.month, input.planningLineId]);

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
      return await api.post<PaymentRequest>("/requests", dto);
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
      return await api.patch<PaymentRequest>(`/requests/${id}`, dto);
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
      return await api.post<PaymentRequest>(`/requests/${id}/submit`);
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
      return await api.post<PaymentRequest>(`/requests/${id}/observe`, dto);
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
      return await api.post<PaymentRequest>(`/requests/${id}/approve`, dto);
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
      return await api.post<PaymentRequest>(`/requests/${id}/reject`, dto);
    } finally {
      setIsLoading(false);
    }
  };

  return { rejectRequest, isLoading };
}
