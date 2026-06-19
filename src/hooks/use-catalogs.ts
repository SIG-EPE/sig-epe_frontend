"use client";

// -------------------------------------------------------
// Catalog hooks — SIG-EPE
// Hooks CRUD para todos los catálogos del sistema
// NO modifica use-budget.ts (esos son read-only para formularios de presupuesto)
// -------------------------------------------------------

import { useState, useCallback, useEffect } from "react";
import { api } from "@/lib/api-client";
import { cachedQuery, QUERY_CACHE_TTL_MS } from "@/lib/query-cache";
import { QUERY_TAGS, invalidateCatalogDomain } from "@/lib/query-tags";
import { useAuthStore } from "@/stores/auth-store";
import type {
  BudgetProgram,
  CreateBudgetProgramDto,
  UpdateBudgetProgramDto,
  FundingSource,
  FundingSourceType,
  CreateFundingSourceTypeDto,
  UpdateFundingSourceTypeDto,
  CreateFundingSourceDto,
  UpdateFundingSourceDto,
  BudgetCategory,
  CreateBudgetCategoryDto,
  UpdateBudgetCategoryDto,
  Territory,
  TerritoryLevel,
  CreateTerritoryDto,
  UpdateTerritoryDto,
  OrganizationalUnit,
  CreateOrganizationalUnitDto,
  UpdateOrganizationalUnitDto,
  StrategicComponent,
  OperativeAction,
} from "@/types/catalogs";

// -------------------------------------------------------
// useCatalogList — helper genérico para listas
// -------------------------------------------------------

function useCatalogList<T>(path: string) {
  const [data, setData] = useState<T[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  const refetch = useCallback(async () => {
    if (authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await cachedQuery({
        key: ["catalog", path],
        ttlMs: QUERY_CACHE_TTL_MS.CATALOG,
        tags: [QUERY_TAGS.CATALOGS, QUERY_TAGS.CATALOG],
        queryFn: () => api.get<T[]>(path),
      });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar datos"));
    } finally {
      setIsLoading(false);
    }
  }, [path, authIsLoading, accessToken]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [refetch, authIsLoading, accessToken]);

  return { data, isLoading, error, refetch };
}

// -------------------------------------------------------
// BUDGET PROGRAMS
// -------------------------------------------------------

export function useCatalogBudgetPrograms(planningType?: string) {
  const [data, setData] = useState<BudgetProgram[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  const refetch = useCallback(async () => {
    if (authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (planningType) params.set("planning_type", planningType);
      const query = params.toString() ? `?${params.toString()}` : "";
      const result = await cachedQuery({
        key: ["catalog", "budget-programs", { planningType }],
        ttlMs: QUERY_CACHE_TTL_MS.CATALOG,
        tags: [QUERY_TAGS.CATALOGS, QUERY_TAGS.CATALOG, QUERY_TAGS.BUDGET],
        queryFn: () => api.get<BudgetProgram[]>(`/catalogs/budget-programs${query}`),
      });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar programas"));
    } finally {
      setIsLoading(false);
    }
  }, [planningType, authIsLoading, accessToken]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [refetch, authIsLoading, accessToken]);

  return { data, isLoading, error, refetch };
}

export function useCreateBudgetProgram() {
  const [isLoading, setIsLoading] = useState(false);

  const create = async (dto: CreateBudgetProgramDto): Promise<BudgetProgram> => {
    setIsLoading(true);
    try {
      const created = await api.post<BudgetProgram>("/catalogs/budget-programs", dto);
      invalidateCatalogDomain();
      return created;
    } finally {
      setIsLoading(false);
    }
  };

  return { create, isLoading };
}

export function useUpdateBudgetProgram(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const update = async (dto: UpdateBudgetProgramDto): Promise<BudgetProgram> => {
    setIsLoading(true);
    try {
      const updated = await api.patch<BudgetProgram>(`/catalogs/budget-programs/${id}`, dto);
      invalidateCatalogDomain();
      return updated;
    } finally {
      setIsLoading(false);
    }
  };

  return { update, isLoading };
}

export function useDeactivateBudgetProgram(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const deactivate = async (): Promise<BudgetProgram> => {
    setIsLoading(true);
    try {
      const deactivated = await api.patch<BudgetProgram>(`/catalogs/budget-programs/${id}/deactivate`);
      invalidateCatalogDomain();
      return deactivated;
    } finally {
      setIsLoading(false);
    }
  };

  return { deactivate, isLoading };
}

// -------------------------------------------------------
// FUNDING SOURCES (ex BUDGET PARTNERS)
// -------------------------------------------------------

export function useCatalogFundingSources() {
  return useCatalogList<FundingSource>("/catalogs/funding-sources");
}

/** @deprecated Use useCatalogFundingSources */
export const useCatalogBudgetPartners = useCatalogFundingSources;

export function useFundingSourceTypes() {
  return useCatalogList<FundingSourceType>("/catalogs/funding-source-types");
}

export function useCatalogFundingSourceTypes() {
  return useCatalogList<FundingSourceType>("/catalogs/funding-source-types?include_inactive=true");
}

export function useCreateFundingSourceType() {
  const [isLoading, setIsLoading] = useState(false);

  const create = async (dto: CreateFundingSourceTypeDto): Promise<FundingSourceType> => {
    setIsLoading(true);
    try {
      const created = await api.post<FundingSourceType>("/catalogs/funding-source-types", dto);
      invalidateCatalogDomain();
      return created;
    } finally {
      setIsLoading(false);
    }
  };

  return { create, isLoading };
}

export function useUpdateFundingSourceType(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const update = async (dto: UpdateFundingSourceTypeDto): Promise<FundingSourceType> => {
    setIsLoading(true);
    try {
      const updated = await api.patch<FundingSourceType>(`/catalogs/funding-source-types/${id}`, dto);
      invalidateCatalogDomain();
      return updated;
    } finally {
      setIsLoading(false);
    }
  };

  return { update, isLoading };
}

export function useDeactivateFundingSourceType(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const deactivate = async (): Promise<FundingSourceType> => {
    setIsLoading(true);
    try {
      const deactivated = await api.patch<FundingSourceType>(`/catalogs/funding-source-types/${id}/deactivate`);
      invalidateCatalogDomain();
      return deactivated;
    } finally {
      setIsLoading(false);
    }
  };

  return { deactivate, isLoading };
}

export function useReactivateFundingSourceType(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const reactivate = async (): Promise<FundingSourceType> => {
    setIsLoading(true);
    try {
      const reactivated = await api.patch<FundingSourceType>(`/catalogs/funding-source-types/${id}/reactivate`);
      invalidateCatalogDomain();
      return reactivated;
    } finally {
      setIsLoading(false);
    }
  };

  return { reactivate, isLoading };
}

export function useCreateFundingSource() {
  const [isLoading, setIsLoading] = useState(false);

  const create = async (dto: CreateFundingSourceDto): Promise<FundingSource> => {
    setIsLoading(true);
    try {
      const created = await api.post<FundingSource>("/catalogs/funding-sources", dto);
      invalidateCatalogDomain();
      return created;
    } finally {
      setIsLoading(false);
    }
  };

  return { create, isLoading };
}

/** @deprecated Use useCreateFundingSource */
export const useCreateBudgetPartner = useCreateFundingSource;

export function useUpdateFundingSource(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const update = async (dto: UpdateFundingSourceDto): Promise<FundingSource> => {
    setIsLoading(true);
    try {
      const updated = await api.patch<FundingSource>(`/catalogs/funding-sources/${id}`, dto);
      invalidateCatalogDomain();
      return updated;
    } finally {
      setIsLoading(false);
    }
  };

  return { update, isLoading };
}

/** @deprecated Use useUpdateFundingSource */
export const useUpdateBudgetPartner = useUpdateFundingSource;

export function useDeactivateFundingSource(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const deactivate = async (): Promise<FundingSource> => {
    setIsLoading(true);
    try {
      const deactivated = await api.patch<FundingSource>(`/catalogs/funding-sources/${id}/deactivate`);
      invalidateCatalogDomain();
      return deactivated;
    } finally {
      setIsLoading(false);
    }
  };

  return { deactivate, isLoading };
}

/** @deprecated Use useDeactivateFundingSource */
export const useDeactivateBudgetPartner = useDeactivateFundingSource;

// -------------------------------------------------------
// BUDGET CATEGORIES
// -------------------------------------------------------

export function useCatalogBudgetCategories() {
  return useCatalogList<BudgetCategory>("/catalogs/budget-categories");
}

export function useCreateBudgetCategory() {
  const [isLoading, setIsLoading] = useState(false);

  const create = async (dto: CreateBudgetCategoryDto): Promise<BudgetCategory> => {
    setIsLoading(true);
    try {
      const created = await api.post<BudgetCategory>("/catalogs/budget-categories", dto);
      invalidateCatalogDomain();
      return created;
    } finally {
      setIsLoading(false);
    }
  };

  return { create, isLoading };
}

export function useUpdateBudgetCategory(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const update = async (dto: UpdateBudgetCategoryDto): Promise<BudgetCategory> => {
    setIsLoading(true);
    try {
      const updated = await api.patch<BudgetCategory>(`/catalogs/budget-categories/${id}`, dto);
      invalidateCatalogDomain();
      return updated;
    } finally {
      setIsLoading(false);
    }
  };

  return { update, isLoading };
}

export function useDeactivateBudgetCategory(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const deactivate = async (): Promise<BudgetCategory> => {
    setIsLoading(true);
    try {
      const deactivated = await api.patch<BudgetCategory>(`/catalogs/budget-categories/${id}/deactivate`);
      invalidateCatalogDomain();
      return deactivated;
    } finally {
      setIsLoading(false);
    }
  };

  return { deactivate, isLoading };
}

// -------------------------------------------------------
// TERRITORIES (CRUD separado del read-only en use-budget.ts)
// -------------------------------------------------------

export function useCatalogTerritories(level?: TerritoryLevel, parentId?: string) {
  const [data, setData] = useState<Territory[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authIsLoading = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  const refetch = useCallback(async () => {
    if (authIsLoading || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (level) params.set("level", level);
      if (parentId) params.set("parent_id", parentId);
      const query = params.toString() ? `?${params.toString()}` : "";
      const result = await api.get<Territory[]>(`/catalogs/territories${query}`);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Error al cargar territorios"));
    } finally {
      setIsLoading(false);
    }
  }, [level, parentId, authIsLoading, accessToken]);

  useEffect(() => {
    if (authIsLoading || !accessToken) return;
    void refetch();
  }, [refetch, authIsLoading, accessToken]);

  return { data, isLoading, error, refetch };
}

export function useCreateTerritory() {
  const [isLoading, setIsLoading] = useState(false);

  const create = async (dto: CreateTerritoryDto): Promise<Territory> => {
    setIsLoading(true);
    try {
      const created = await api.post<Territory>("/catalogs/territories", dto);
      invalidateCatalogDomain();
      return created;
    } finally {
      setIsLoading(false);
    }
  };

  return { create, isLoading };
}

export function useUpdateTerritory(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const update = async (dto: UpdateTerritoryDto): Promise<Territory> => {
    setIsLoading(true);
    try {
      const updated = await api.patch<Territory>(`/catalogs/territories/${id}`, dto);
      invalidateCatalogDomain();
      return updated;
    } finally {
      setIsLoading(false);
    }
  };

  return { update, isLoading };
}

export function useDeactivateTerritory(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const deactivate = async (): Promise<Territory> => {
    setIsLoading(true);
    try {
      const deactivated = await api.patch<Territory>(`/catalogs/territories/${id}/deactivate`);
      invalidateCatalogDomain();
      return deactivated;
    } finally {
      setIsLoading(false);
    }
  };

  return { deactivate, isLoading };
}

// -------------------------------------------------------
// ORGANIZATIONAL UNITS (CRUD separado del read-only en use-budget.ts)
// -------------------------------------------------------

export function useCatalogOrganizationalUnits() {
  return useCatalogList<OrganizationalUnit>("/catalogs/organizational-units");
}

/**
 * Retorna el árbol de UOs (con children eager-loaded nivel 1).
 * Llama GET /catalogs/organizational-units?tree=true
 */
export function useOrgUnitsTree() {
  return useCatalogList<OrganizationalUnit>("/catalogs/organizational-units?tree=true");
}


export function useCreateOrganizationalUnit() {
  const [isLoading, setIsLoading] = useState(false);

  const create = async (dto: CreateOrganizationalUnitDto): Promise<OrganizationalUnit> => {
    setIsLoading(true);
    try {
      const created = await api.post<OrganizationalUnit>("/catalogs/organizational-units", dto);
      invalidateCatalogDomain();
      return created;
    } finally {
      setIsLoading(false);
    }
  };

  return { create, isLoading };
}

export function useUpdateOrganizationalUnit(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const update = async (dto: UpdateOrganizationalUnitDto): Promise<OrganizationalUnit> => {
    setIsLoading(true);
    try {
      const updated = await api.patch<OrganizationalUnit>(`/catalogs/organizational-units/${id}`, dto);
      invalidateCatalogDomain();
      return updated;
    } finally {
      setIsLoading(false);
    }
  };

  return { update, isLoading };
}

export function useDeactivateOrganizationalUnit(id: string) {
  const [isLoading, setIsLoading] = useState(false);

  const deactivate = async (): Promise<OrganizationalUnit> => {
    setIsLoading(true);
    try {
      const deactivated = await api.patch<OrganizationalUnit>(`/catalogs/organizational-units/${id}/deactivate`);
      invalidateCatalogDomain();
      return deactivated;
    } finally {
      setIsLoading(false);
    }
  };

  return { deactivate, isLoading };
}

// -------------------------------------------------------
// STRATEGIC COMPONENTS — filtrable por program_id
// -------------------------------------------------------

export function useStrategicComponents(programId?: string | null) {
  const [data, setData] = useState<StrategicComponent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authIsLoading = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  const refetch = useCallback(async () => {
    if (authIsLoading || !accessToken || !programId) {
      setData([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<StrategicComponent[]>(
        `/catalogs/strategic-components?program_id=${programId}`
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar componentes");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authIsLoading, programId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
}

// -------------------------------------------------------
// OPERATIVE ACTIONS — filtrable por component_id
// -------------------------------------------------------

export function useOperativeActions(componentId?: string | null) {
  const [data, setData] = useState<OperativeAction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authIsLoading = useAuthStore((s) => s.isLoading);
  const accessToken = useAuthStore((s) => s.accessToken);

  const refetch = useCallback(async () => {
    if (authIsLoading || !accessToken || !componentId) {
      setData([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<OperativeAction[]>(
        `/catalogs/operative-actions?component_id=${componentId}`
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar acciones operativas");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authIsLoading, componentId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
}
