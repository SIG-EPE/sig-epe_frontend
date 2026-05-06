"use client";

// -------------------------------------------------------
// Budget hooks — SIG-EPE
// Hooks para consumo del API de presupuesto
// -------------------------------------------------------

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { api, ApiRequestError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type {
  BalanceData,
  BalanceFilters,
  FiscalYear,
  PlanningLine,
  MonthlyEntry,
  FundingSourceAllocation as LineFundingSourceAllocationFromTypes,
  ManualExecution,
  PlanningLineStats,
} from "@/types/budget";

// -------------------------------------------------------
// Hook para obtener el balance presupuestal
// GET /budget/balance/:fiscalYearId
// -------------------------------------------------------

interface UseBalanceReturn {
  data: BalanceData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useBalance(
  fiscalYearId: string,
  filters?: BalanceFilters
): UseBalanceReturn {
  const [data, setData] = useState<BalanceData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async () => {
    if (!fiscalYearId || authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.org_unit_id) params.set("org_unit_id", filters.org_unit_id);
      if (filters?.territory_id) params.set("territory_id", filters.territory_id);

      const queryString = params.toString();
      const path = `/budget/balance/${fiscalYearId}${queryString ? `?${queryString}` : ""}`;

      const result = await api.get<BalanceData>(path);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al obtener balance presupuestal"));
    } finally {
      setIsLoading(false);
    }
  }, [fiscalYearId, authIsLoading, accessToken, filters?.org_unit_id, filters?.territory_id]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [refetch, authIsLoading, accessToken]);

  return { data, isLoading, error, refetch };
}

// -------------------------------------------------------
// Hook para obtener anos fiscales
// GET /budget/fiscal-years
// -------------------------------------------------------

interface UseFiscalYearsReturn {
  fiscalYears: FiscalYear[] | null;
  data: FiscalYear[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useFiscalYears(): UseFiscalYearsReturn {
  const [data, setData] = useState<FiscalYear[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async () => {
    if (authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<FiscalYear[]>("/budget/fiscal-years");
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al obtener anos fiscales"));
    } finally {
      setIsLoading(false);
    }
  }, [authIsLoading, accessToken]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [refetch, authIsLoading, accessToken]);

  return { fiscalYears: data, data, isLoading, error, refetch };
}

// -------------------------------------------------------
// Hook para obtener unidades organicas
// GET /catalogs/organizational-units
// -------------------------------------------------------

interface OrganizationalUnit {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface UseOrganizationalUnitsReturn {
  data: OrganizationalUnit[] | null;
  isLoading: boolean;
  error: Error | null;
}

export function useOrganizationalUnits(): UseOrganizationalUnitsReturn {
  const [data, setData] = useState<OrganizationalUnit[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<OrganizationalUnit[]>("/catalogs/organizational-units")
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error("Error al obtener unidades organicas"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authIsLoading, accessToken]);

  return { data, isLoading, error };
}

// -------------------------------------------------------
// Hook para obtener territorios con filtros
// GET /catalogs/territories?level=X&parent_id=Y
// -------------------------------------------------------

interface Territory {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  parent_id: string | null;
  level: "REGION" | "PROVINCIA" | "DISTRITO" | "COMUNIDAD";
  ubigeo_code: string | null;
  created_at: string;
  updated_at: string;
}

interface UseTerritoriesReturn {
  data: Territory[] | null;
  isLoading: boolean;
  error: Error | null;
}

export function useTerritories(level?: string, parentId?: string): UseTerritoriesReturn {
  const [data, setData] = useState<Territory[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (level) params.set("level", level);
    if (parentId) params.set("parent_id", parentId);

    const queryString = params.toString();
    const path = `/catalogs/territories${queryString ? `?${queryString}` : ""}`;

    api
      .get<Territory[]>(path)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error("Error al obtener territorios"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authIsLoading, accessToken, level, parentId]);

  return { data, isLoading, error };
}

// -------------------------------------------------------
// Planning Lines — tipos
// Re-exportados desde @/types/budget (fuente de verdad)
// -------------------------------------------------------

export type { PlanningLine, MonthlyEntry } from "@/types/budget";

/** Alias para compatibilidad con imports existentes */
export type LineFundingSourceEntry = {
  id: string;
  funding_source_id: string;
  allocated_amount: number;
  percentage: number;
  /** Relación cargada por TypeORM — camelCase */
  fundingSource?: { id: string; code: string; name: string };
};

/** @deprecated Use LineFundingSourceEntry */
export interface Partner {
  id: string;
  partner_id: string;
  allocated_amount: number;
  percentage: number;
  partner?: { id: string; code: string; name: string };
}

export interface PlanningLinesResponse {
  lines: PlanningLine[];
  total: number;
  page: number;
  limit: number;
}

// -------------------------------------------------------
// usePlanningLines — lista paginada con filtros
// GET /budget/planning-lines
// -------------------------------------------------------

export function usePlanningLines(filters?: {
  fiscal_year_id?: string;
  org_unit_id?: string;
  status?: string;
  created_by?: string;
  page?: number;
}) {
  const [data, setData] = useState<PlanningLinesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.fiscal_year_id) params.set("fiscal_year_id", filters.fiscal_year_id);
      if (filters?.org_unit_id) params.set("org_unit_id", filters.org_unit_id);
      if (filters?.status) params.set("status", filters.status);
      if (filters?.created_by) params.set("created_by", filters.created_by);
      if (filters?.page) params.set("page", String(filters.page));

      const query = params.toString() ? `?${params.toString()}` : "";
      const result = await api.get<PlanningLinesResponse>(`/budget/planning-lines${query}`);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar lineas");
    } finally {
      setIsLoading(false);
    }
  }, [filters?.fiscal_year_id, filters?.org_unit_id, filters?.status, filters?.created_by, filters?.page]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch, authIsLoading, accessToken]);

  return {
    lines: data?.lines ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    limit: data?.limit ?? 20,
    isLoading,
    error,
    refetch,
  };
}

// -------------------------------------------------------
// usePlanningLine — detalle de una linea
// GET /budget/planning-lines/:id
// -------------------------------------------------------

export function usePlanningLine(id: string) {
  const [data, setData] = useState<PlanningLine | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<PlanningLine>(`/budget/planning-lines/${id}`);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar linea");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id || authIsLoading || !accessToken) return;
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refetch, authIsLoading, accessToken]);

  return { line: data, isLoading, error, refetch };
}

// -------------------------------------------------------
// useSubmitPlanningLine — envia una linea
// POST /budget/planning-lines/:id/submit
// -------------------------------------------------------

export function useSubmitPlanningLine(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await api.post(`/budget/planning-lines/${id}/submit`);
    } finally {
      setIsLoading(false);
    }
  };

  return { submit, isLoading };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toReadableMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    const messages = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    return messages.length > 0 ? messages.join("\n") : null;
  }

  return null;
}

export function getSubmitPlanningLineErrorMessage(error: unknown): string | null {
  if (error instanceof ApiRequestError) {
    return toReadableMessage(error.body.message) ?? toReadableMessage(error.message);
  }

  if (isRecord(error)) {
    const response = error.response;
    if (isRecord(response)) {
      const data = response.data;
      if (isRecord(data)) {
        const responseMessage = toReadableMessage(data.message);
        if (responseMessage) return responseMessage;
      }
    }

    const directMessage = toReadableMessage(error.message);
    if (directMessage) return directMessage;
  }

  if (error instanceof Error) {
    return toReadableMessage(error.message);
  }

  return null;
}

// -------------------------------------------------------
// useApprovePlanningLine — aprueba una linea
// POST /budget/planning-lines/:id/approve
// -------------------------------------------------------

export function useApprovePlanningLine(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const approve = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await api.post(`/budget/planning-lines/${id}/approve`);
    } finally {
      setIsLoading(false);
    }
  };

  return { approve, isLoading };
}

// -------------------------------------------------------
// useRejectPlanningLine — rechaza una linea
// POST /budget/planning-lines/:id/reject
// -------------------------------------------------------

export function useRejectPlanningLine(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const reject = async (body: { rejection_reason: string }): Promise<void> => {
    setIsLoading(true);
    try {
      await api.post(`/budget/planning-lines/${id}/reject`, body);
    } finally {
      setIsLoading(false);
    }
  };

  return { reject, isLoading };
}

// -------------------------------------------------------
// useFiscalYear — obtener un ano fiscal por id
// GET /budget/fiscal-years/:id
// -------------------------------------------------------

interface UseFiscalYearReturn {
  data: FiscalYear | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useFiscalYear(id: string): UseFiscalYearReturn {
  const [data, setData] = useState<FiscalYear | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  const refetch = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<FiscalYear>(`/budget/fiscal-years/${id}`);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al obtener año fiscal"));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refetch, authIsLoading, accessToken]);

  return { data, isLoading, error, refetch };
}

// -------------------------------------------------------
// useCreateFiscalYear — crear un ano fiscal
// POST /budget/fiscal-years
// -------------------------------------------------------

export interface CreateFiscalYearDto {
  year: number;
  notes?: string;
}

export function useCreateFiscalYear() {
  const [isLoading, setIsLoading] = useState(false);

  const create = async (dto: CreateFiscalYearDto): Promise<FiscalYear> => {
    setIsLoading(true);
    try {
      const result = await api.post<FiscalYear>("/budget/fiscal-years", dto);
      return result;
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { create, isLoading };
}

// -------------------------------------------------------
// useUpdateFiscalYear — actualizar notas de un ano fiscal
// PATCH /budget/fiscal-years/:id
// -------------------------------------------------------

export interface UpdateFiscalYearDto {
  notes: string;
}

export function useUpdateFiscalYear(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const update = async (dto: UpdateFiscalYearDto): Promise<FiscalYear> => {
    setIsLoading(true);
    try {
      const result = await api.patch<FiscalYear>(`/budget/fiscal-years/${id}`, dto);
      return result;
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { update, isLoading };
}

// -------------------------------------------------------
// useActivateFiscalYear — activar un ano fiscal
// POST /budget/fiscal-years/:id/activate
// -------------------------------------------------------

export function useActivateFiscalYear(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const activate = async (): Promise<FiscalYear> => {
    setIsLoading(true);
    try {
      const result = await api.post<FiscalYear>(`/budget/fiscal-years/${id}/activate`);
      return result;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        toast.error("Ya existe otro año fiscal activo");
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { activate, isLoading };
}

// -------------------------------------------------------
// useCloseFiscalYear — cerrar un ano fiscal
// POST /budget/fiscal-years/:id/close
// -------------------------------------------------------

export function useCloseFiscalYear(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const close = async (): Promise<FiscalYear> => {
    setIsLoading(true);
    try {
      const result = await api.post<FiscalYear>(`/budget/fiscal-years/${id}/close`);
      return result;
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return { close, isLoading };
}

// -------------------------------------------------------
// useMonthlyDistribution — obtener distribución mensual
// GET /budget/planning-lines/:id/monthly
// -------------------------------------------------------

export interface MonthlyDistribution {
  id: string;
  planning_line_id: string;
  month: number;
  planned_amount: number;
  executed_amount: number;
}

interface UseMonthlyDistributionReturn {
  data: MonthlyDistribution[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useMonthlyDistribution(lineId: string): UseMonthlyDistributionReturn {
  const [data, setData] = useState<MonthlyDistribution[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    if (!lineId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<MonthlyDistribution[]>(`/budget/planning-lines/${lineId}/monthly`);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al obtener distribución mensual"));
    } finally {
      setIsLoading(false);
    }
  }, [lineId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
}

// -------------------------------------------------------
// useExecutedAmount — obtener ejecutado por mes
// GET /budget/planning-lines/:id/monthly/:month/executed
// -------------------------------------------------------

interface UseExecutedAmountReturn {
  data: { planned_amount: number; executed_amount: number } | null;
  isLoading: boolean;
  error: Error | null;
}

export function useExecutedAmount(lineId: string, month: number) {
  const [data, setData] = useState<{ planned_amount: number; executed_amount: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!lineId || !month) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<{ planned_amount: number; executed_amount: number }>(`/budget/planning-lines/${lineId}/monthly/${month}/executed`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error("Error al obtener ejecutado"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lineId, month]);

  return { data, isLoading, error };
}

// -------------------------------------------------------
// Partner Allocations — tipos
// -------------------------------------------------------

export interface FundingSourceAllocation {
  id: string;
  fiscal_year_id: string;
  funding_source_id: string;
  total_contribution: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Relaciones opcionales que el backend puede incluir (camelCase — TypeORM)
  fundingSource?: { id: string; code: string; name: string };
  fiscal_year?: { id: string; year: number };
}

/** @deprecated Use FundingSourceAllocation */
export type PartnerAllocation = FundingSourceAllocation & {
  partner_id: string;
  partner?: { id: string; code: string; name: string };
};

export interface CreateFundingSourceAllocationDto {
  fiscal_year_id: string;
  funding_source_id: string;
  total_contribution: number;
  notes?: string;
}

/** @deprecated Use CreateFundingSourceAllocationDto */
export type CreatePartnerAllocationDto = CreateFundingSourceAllocationDto & { partner_id?: string };

export interface UpdateFundingSourceAllocationDto {
  total_contribution?: number;
  notes?: string;
}

/** @deprecated Use UpdateFundingSourceAllocationDto */
export type UpdatePartnerAllocationDto = UpdateFundingSourceAllocationDto;

// -------------------------------------------------------
// useFundingSourceAllocations — listar aportes por año fiscal
// GET /budget/funding-source-allocations?fiscal_year_id=xxx
// -------------------------------------------------------

export function useFundingSourceAllocations(fiscalYearId?: string) {
  const [data, setData] = useState<FundingSourceAllocation[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  const refetch = useCallback(async () => {
    if (!fiscalYearId || authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<FundingSourceAllocation[]>(
        `/budget/funding-source-allocations?fiscal_year_id=${fiscalYearId}`
      );
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al obtener aportes"));
    } finally {
      setIsLoading(false);
    }
  }, [fiscalYearId, authIsLoading, accessToken]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [refetch, authIsLoading, accessToken]);

  return { data, isLoading, error, refetch };
}

/** @deprecated Use useFundingSourceAllocations */
export const usePartnerAllocations = useFundingSourceAllocations;

// -------------------------------------------------------
// useCreateFundingSourceAllocation
// POST /budget/funding-source-allocations
// -------------------------------------------------------

export function useCreateFundingSourceAllocation() {
  const [isLoading, setIsLoading] = useState(false);

  const create = async (dto: CreateFundingSourceAllocationDto): Promise<FundingSourceAllocation> => {
    setIsLoading(true);
    try {
      return await api.post<FundingSourceAllocation>("/budget/funding-source-allocations", dto);
    } finally {
      setIsLoading(false);
    }
  };

  return { create, isLoading };
}

/** @deprecated Use useCreateFundingSourceAllocation */
export const useCreatePartnerAllocation = useCreateFundingSourceAllocation;

// -------------------------------------------------------
// useUpdateFundingSourceAllocation
// PATCH /budget/funding-source-allocations/:id
// -------------------------------------------------------

export function useUpdateFundingSourceAllocation(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const update = async (dto: UpdateFundingSourceAllocationDto): Promise<FundingSourceAllocation> => {
    setIsLoading(true);
    try {
      return await api.patch<FundingSourceAllocation>(`/budget/funding-source-allocations/${id}`, dto);
    } finally {
      setIsLoading(false);
    }
  };

  return { update, isLoading };
}

/** @deprecated Use useUpdateFundingSourceAllocation */
export const useUpdatePartnerAllocation = useUpdateFundingSourceAllocation;

// -------------------------------------------------------
// useDeleteFundingSourceAllocation
// DELETE /budget/funding-source-allocations/:id
// -------------------------------------------------------

export function useDeleteFundingSourceAllocation() {
  const [isLoading, setIsLoading] = useState(false);

  const remove = async (id: string): Promise<void> => {
    setIsLoading(true);
    try {
      await api.delete(`/budget/funding-source-allocations/${id}`);
    } finally {
      setIsLoading(false);
    }
  };

  return { remove, isLoading };
}

/** @deprecated Use useDeleteFundingSourceAllocation */
export const useDeletePartnerAllocation = useDeleteFundingSourceAllocation;

// -------------------------------------------------------
// useFundingSources — fuentes de financiamiento desde catálogos
// GET /catalogs/funding-sources
// -------------------------------------------------------

export interface FundingSourceCatalog {
  id: string;
  code: string;
  name: string;
  description?: string;
  fundingSourceType?: { id: string; name: string } | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** @deprecated Use FundingSourceCatalog */
export type BudgetPartner = FundingSourceCatalog;

export function useFundingSources() {
  const [data, setData] = useState<FundingSourceCatalog[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<FundingSourceCatalog[]>("/catalogs/funding-sources")
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e : new Error("Error al obtener fuentes de financiamiento"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authIsLoading, accessToken]);

  return { data, isLoading, error };
}

/** @deprecated Use useFundingSources */
export const useBudgetPartners = useFundingSources;

// -------------------------------------------------------
// useBudgetPrograms — programas desde catálogos, filtrable por planning_type
// GET /catalogs/budget-programs?planning_type=X
// -------------------------------------------------------

export interface BudgetProgram {
  id: string;
  code: string;
  name: string;
  planningType: string | null;
  is_active: boolean;
  territory_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useBudgetPrograms(planningType?: string) {
  const [data, setData] = useState<BudgetProgram[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (planningType) params.set("planning_type", planningType);
    const qs = params.toString() ? `?${params.toString()}` : "";

    api
      .get<BudgetProgram[]>(`/catalogs/budget-programs${qs}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e : new Error("Error al obtener programas"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authIsLoading, accessToken, planningType]);

  return { data, isLoading, error };
}

// -------------------------------------------------------
// useBudgetCategories — categorías desde catálogos
// GET /catalogs/budget-categories
// -------------------------------------------------------

export interface BudgetCategory {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useBudgetCategories() {
  const [data, setData] = useState<BudgetCategory[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<BudgetCategory[]>("/catalogs/budget-categories")
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e : new Error("Error al obtener categorías"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authIsLoading, accessToken]);

  return { data, isLoading, error };
}

// -------------------------------------------------------
// useActiveFiscalYear — año fiscal activo
// GET /budget/fiscal-years?status=ACTIVE
// -------------------------------------------------------

export function useActiveFiscalYear() {
  const [data, setData] = useState<FiscalYear | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    api
      .get<FiscalYear[]>("/budget/fiscal-years?status=ACTIVE")
      .then((result) => {
        if (!cancelled) setData(result[0] ?? null);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e : new Error("Error al obtener año fiscal activo"));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authIsLoading, accessToken]);

  return { data, isLoading, error };
}

// -------------------------------------------------------
// useCreatePlanningLine — crear línea POA
// POST /budget/planning-lines
// -------------------------------------------------------

export interface CreatePlanningLineDto {
  fiscal_year_id: string;
  organizational_unit_id: string;
  budget_category_id: string;
  territory_id?: string;
  planning_type: "PROGRAMA" | "PROYECTO" | "GESTIÓN";
  resource_description: string;
  operative_action_id?: string | null;
  importance?: string;
  frequency?: string;
  unit_price: number;
  quantity: number;
  program_id?: string;
}

export function useCreatePlanningLine() {
  const [isLoading, setIsLoading] = useState(false);

  const create = async (dto: CreatePlanningLineDto): Promise<{ id: string }> => {
    setIsLoading(true);
    try {
      return await api.post<{ id: string }>("/budget/planning-lines", dto);
    } finally {
      setIsLoading(false);
    }
  };

  return { create, isLoading };
}

// -------------------------------------------------------
// Line Funding Sources — tipos e interfaces
// -------------------------------------------------------

export interface LineFundingSource {
  id: string;
  funding_source_id: string;
  planning_line_id: string;
  allocated_amount?: number | null;
  percentage?: number | null;
  created_at: string;
  /** Relación cargada por TypeORM — el backend serializa en camelCase */
  fundingSource?: { id: string; code: string; name: string };
}

/** @deprecated Use LineFundingSource */
export interface LinePartner {
  id: string;
  partner_id: string;
  planning_line_id: string;
  allocated_amount: number;
  percentage: number;
  created_at: string;
  partner?: { id: string; code: string; name: string };
}

export interface FundingSourceSuggestion {
  fundingSourceId: string;
  fundingSourceName: string;
  suggestedAmount: number;
  availableBalance: number;
  percentage: number;
}

/** @deprecated Use FundingSourceSuggestion */
export interface PartnerSuggestion {
  partnerId: string;
  partnerName: string;
  suggestedAmount: number;
  availableBalance: number;
  percentage: number;
}

// -------------------------------------------------------
// useLineFundingSources — fuentes asignadas a una línea
// GET /budget/planning-lines/:id/funding-sources
// -------------------------------------------------------

export function useLineFundingSources(lineId: string) {
  const [data, setData] = useState<LineFundingSource[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  const refetch = useCallback(async () => {
    if (!lineId || authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<LineFundingSource[]>(`/budget/planning-lines/${lineId}/funding-sources`);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al obtener fuentes de financiamiento de la línea"));
    } finally {
      setIsLoading(false);
    }
  }, [lineId, authIsLoading, accessToken]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [refetch, authIsLoading, accessToken]);

  return { data, isLoading, error, refetch };
}

/** @deprecated Use useLineFundingSources */
export const useLinePartners = useLineFundingSources;

// -------------------------------------------------------
// useSuggestFundingSources — sugerir distribución proporcional
// POST /budget/planning-lines/:id/funding-sources/suggest
// -------------------------------------------------------

export function useSuggestFundingSources() {
  const [isLoading, setIsLoading] = useState(false);

  const suggest = async (
    lineId: string,
    fundingSourceIds: string[],
    totalAmount: number,
  ): Promise<FundingSourceSuggestion[]> => {
    setIsLoading(true);
    try {
      const result = await api.post<{ suggestions: FundingSourceSuggestion[] }>(
        `/budget/planning-lines/${lineId}/funding-sources/suggest`,
        { fundingSourceIds, totalAmount },
      );
      return result.suggestions;
    } finally {
      setIsLoading(false);
    }
  };

  return { suggest, isLoading };
}

/** @deprecated Use useSuggestFundingSources */
export const useSuggestPartners = useSuggestFundingSources;

// -------------------------------------------------------
// useAddLineFundingSource — agregar fuente a una línea
// POST /budget/planning-lines/:id/funding-sources
// -------------------------------------------------------

export function useAddLineFundingSource() {
  const [isLoading, setIsLoading] = useState(false);

  const add = async (
    lineId: string,
    fundingSourceId: string,
  ): Promise<LineFundingSource> => {
    setIsLoading(true);
    try {
      return await api.post<LineFundingSource>(`/budget/planning-lines/${lineId}/funding-sources`, {
        funding_source_id: fundingSourceId,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return { add, isLoading };
}

/** @deprecated Use useAddLineFundingSource */
export const useAddLinePartner = useAddLineFundingSource;

// -------------------------------------------------------
// useRemoveLineFundingSource — eliminar fuente de financiamiento de una línea
// DELETE /budget/planning-lines/:id/funding-sources/:fundingSourceId
// -------------------------------------------------------

export function useRemoveLineFundingSource() {
  const [isLoading, setIsLoading] = useState(false);

  const remove = async (lineId: string, fundingSourceId: string): Promise<void> => {
    setIsLoading(true);
    try {
      await api.delete(`/budget/planning-lines/${lineId}/funding-sources/${fundingSourceId}`);
    } finally {
      setIsLoading(false);
    }
  };

  return { remove, isLoading };
}

/** @deprecated Use useRemoveLineFundingSource */
export const useRemoveLinePartner = useRemoveLineFundingSource;

// -------------------------------------------------------
// useUpsertMonthly — guardar programación mensual
// PUT /budget/planning-lines/:id/monthly
// -------------------------------------------------------

export interface UpsertMonthlyDto {
  distribution: Array<{ month: number; planned_amount: number }>;
}

export function useUpsertMonthly() {
  const [isLoading, setIsLoading] = useState(false);

  const upsert = async (lineId: string, dto: UpsertMonthlyDto): Promise<void> => {
    setIsLoading(true);
    try {
      await api.put(`/budget/planning-lines/${lineId}/monthly`, dto);
    } finally {
      setIsLoading(false);
    }
  };

  return { upsert, isLoading };
}

// -------------------------------------------------------
// usePlanningLineStats — estadísticas agrupadas por estado
// GET /budget/planning-lines/stats?fiscal_year_id=X&org_unit_id=Y
// -------------------------------------------------------

export function usePlanningLineStats(fiscalYearId?: string, orgUnitId?: string) {
  const [data, setData] = useState<PlanningLineStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  const refetch = useCallback(async () => {
    if (!fiscalYearId || authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("fiscal_year_id", fiscalYearId);
      if (orgUnitId) params.set("org_unit_id", orgUnitId);
      const result = await api.get<PlanningLineStats>(`/budget/planning-lines/stats?${params.toString()}`);
      setData(result);
    } catch (e) {
      // Si el endpoint aún no existe, no crashear — retornar null silenciosamente
      setData(null);
      setError(e instanceof Error ? e : new Error("Error al obtener estadísticas"));
    } finally {
      setIsLoading(false);
    }
  }, [fiscalYearId, orgUnitId, authIsLoading, accessToken]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [refetch, authIsLoading, accessToken]);

  return { data, isLoading, error, refetch };
}

// -------------------------------------------------------
// useManualExecutions — ejecuciones manuales de una línea
// GET /budget/planning-lines/:lineId/manual-executions?month=X
// -------------------------------------------------------

export function useManualExecutions(lineId: string, month?: number) {
  const [data, setData] = useState<ManualExecution[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  const refetch = useCallback(async () => {
    if (!lineId || authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (month !== undefined) params.set("month", String(month));
      const qs = params.toString() ? `?${params.toString()}` : "";
      const result = await api.get<ManualExecution[]>(`/budget/planning-lines/${lineId}/manual-executions${qs}`);
      setData(result);
    } catch (e) {
      // Endpoint puede no existir aún — retornar array vacío
      setData([]);
      setError(e instanceof Error ? e : new Error("Error al obtener ejecuciones manuales"));
    } finally {
      setIsLoading(false);
    }
  }, [lineId, month, authIsLoading, accessToken]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [refetch, authIsLoading, accessToken]);

  return { data, isLoading, error, refetch };
}

// -------------------------------------------------------
// useAddManualExecution — registrar ejecución manual
// POST /budget/planning-lines/:lineId/manual-executions
// -------------------------------------------------------

export interface CreateManualExecutionDto {
  month: number;
  amount: number;
  concept: string;
  execution_date: string;
}

export function useAddManualExecution(lineId: string) {
  const [isLoading, setIsLoading] = useState(false);

  const mutate = async (dto: CreateManualExecutionDto, options?: {
    onSuccess?: () => void;
    onError?: (e: Error) => void;
  }): Promise<void> => {
    setIsLoading(true);
    try {
      await api.post<ManualExecution>(`/budget/planning-lines/${lineId}/manual-executions`, dto);
      options?.onSuccess?.();
    } catch (e) {
      options?.onError?.(e instanceof Error ? e : new Error("Error al registrar ejecución"));
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading };
}

// -------------------------------------------------------
// useDeleteManualExecution — eliminar ejecución manual
// DELETE /budget/planning-lines/:lineId/manual-executions/:execId
// -------------------------------------------------------

export function useDeleteManualExecution(lineId: string) {
  const [isLoading, setIsLoading] = useState(false);

  const remove = async (execId: string): Promise<void> => {
    setIsLoading(true);
    try {
      await api.delete(`/budget/planning-lines/${lineId}/manual-executions/${execId}`);
    } finally {
      setIsLoading(false);
    }
  };

  return { remove, isLoading };
}
