"use client";

import { useCachedResource } from "@/hooks/use-cached-resource";
import { api } from "@/lib/api-client";
import { QUERY_CACHE_TTL_MS } from "@/lib/query-cache";
import { QUERY_TAGS } from "@/lib/query-tags";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

/** Registro de auditoría tal como lo devuelve el backend */
export interface AuditLogDto {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  user_role: string | null;
  user_email: string | null;
  http_method: string | null;
  endpoint: string | null;
  status_code: number | null;
  error_message: string | null;
  created_at: string;
}

export interface AuditLogsFilters {
  page: number;
  limit: number;
  userId?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditLogsResponse {
  data: AuditLogDto[];
  total: number;
  page: number;
  limit: number;
}

// -------------------------------------------------------
// useAuditLogs — lista paginada con filtros
// -------------------------------------------------------

export function useAuditLogs(filters: AuditLogsFilters) {
  const resource = useCachedResource<AuditLogsResponse>({
    key: [QUERY_TAGS.AUDIT, "list", filters],
    ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
    tags: [QUERY_TAGS.AUDIT],
    errorMessage: "Error al cargar los registros de auditoría",
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(filters.page),
        limit: String(filters.limit),
      });
      if (filters.userId) params.set("userId", filters.userId);
      if (filters.action) params.set("action", filters.action);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);

      return api.get<AuditLogsResponse>(`/audit-logs?${params.toString()}`);
    },
  });
  const data = resource.data;

  return {
    logs: data?.data ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? filters.page,
    limit: data?.limit ?? filters.limit,
    isLoading: resource.isLoading,
    isInitialLoading: resource.isInitialLoading,
    isRefreshing: resource.isRefreshing,
    error: resource.error?.message ?? null,
    refetch: resource.refetch,
  };
}
