"use client";

import { useState, useEffect, useCallback } from "react";

import { api } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

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
  const [data, setData] = useState<AuditLogsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(filters.page),
        limit: String(filters.limit),
      });
      if (filters.userId) params.set("userId", filters.userId);
      if (filters.action) params.set("action", filters.action);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);

      const result = await api.get<AuditLogsResponse>(
        `/audit-logs?${params.toString()}`,
      );
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los registros de auditoría");
    } finally {
      setIsLoading(false);
    }
  }, [
    filters.page,
    filters.limit,
    filters.userId,
    filters.action,
    filters.dateFrom,
    filters.dateTo,
  ]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch, authIsLoading, accessToken]);

  return {
    logs: data?.data ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? filters.page,
    limit: data?.limit ?? filters.limit,
    isLoading,
    error,
    refetch,
  };
}
