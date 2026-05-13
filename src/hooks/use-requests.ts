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
  RequestBudgetPreview,
  RequestPlanningLineLookupResponse,
  RequestDocument,
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

function getRequestsPath(filters?: RequestsListFilters): string {
  const params = new URLSearchParams();
  appendIfPresent(params, "page", filters?.page);
  appendIfPresent(params, "limit", filters?.limit);
  appendIfPresent(params, "status", filters?.status);
  appendIfPresent(params, "request_type", filters?.request_type);
  appendIfPresent(params, "budget_planning_line_id", filters?.budget_planning_line_id);
  appendIfPresent(params, "org_unit_id", filters?.org_unit_id);
  appendIfPresent(params, "search", filters?.search);
  const query = params.toString();
  return `/requests${query ? `?${query}` : ""}`;
}

export function useRequests(filters?: RequestsListFilters) {
  const [data, setData] = useState<RequestsListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const pageFilter = filters?.page;
  const limitFilter = filters?.limit;
  const statusFilter = filters?.status;
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

  const uploadDocument = async (requestId: string, input: UploadRequestDocumentInput): Promise<RequestDocument> => {
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", input.file);
      formData.append("document_category", input.document_category);
      if (input.metadata_json) {
        formData.append("metadata_json", JSON.stringify(input.metadata_json));
      }
      return await api.postForm<RequestDocument>(`/requests/${requestId}/documents`, formData);
    } finally {
      setIsLoading(false);
    }
  };

  return { uploadDocument, isLoading };
}

export function useDeleteRequestDocument() {
  const [isLoading, setIsLoading] = useState(false);

  const deleteDocument = async (requestId: string, documentId: string): Promise<void> => {
    setIsLoading(true);
    try {
      await api.delete<void>(`/requests/${requestId}/documents/${documentId}`);
    } finally {
      setIsLoading(false);
    }
  };

  return { deleteDocument, isLoading };
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
