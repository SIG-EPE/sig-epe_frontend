"use client";

import { useCachedResource } from "@/hooks/use-cached-resource";
import {
  getBudgetExecutionDashboard,
  getGiofOperationsDashboard,
  getOrgUnitExecutionDashboard,
  getOrgUnitExecutionDashboardOptions,
} from "@/lib/dashboard";
import { QUERY_CACHE_TTL_MS } from "@/lib/query-cache";
import { QUERY_TAGS } from "@/lib/query-tags";
import type {
  BudgetDashboardExecution,
  BudgetDashboardExecutionFilters,
  GiofOperationsDashboard,
  GiofOperationsDashboardFilters,
  OrgUnitExecutionDashboard,
  OrgUnitExecutionDashboardFilters,
  OrgUnitExecutionOptionsResponse,
} from "@/types/dashboard";

interface DashboardHookState<T> {
  data: T | null;
  isLoading: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refetch: (options?: { force?: boolean }) => Promise<void>;
}

interface DashboardHookOptions {
  enabled?: boolean;
}

function useCachedDashboardQuery<T>({
  enabled,
  key,
  tags,
  errorMessage,
  queryFn,
}: {
  enabled: boolean;
  key: readonly unknown[];
  tags: readonly string[];
  errorMessage: string;
  queryFn: (signal: AbortSignal) => Promise<T>;
}): DashboardHookState<T> {
  return useCachedResource<T>({
    enabled,
    key,
    ttlMs: QUERY_CACHE_TTL_MS.DASHBOARD,
    tags,
    errorMessage,
    queryFn,
  });
}

export function useBudgetExecutionDashboard(
  filters: BudgetDashboardExecutionFilters | null,
): DashboardHookState<BudgetDashboardExecution> {
  return useCachedDashboardQuery({
    enabled: Boolean(filters),
    key: ["dashboard", "budget-execution", filters ?? {}],
    tags: [QUERY_TAGS.DASHBOARD, QUERY_TAGS.BUDGET],
    errorMessage: "Error al cargar dashboard presupuestal",
    queryFn: () => getBudgetExecutionDashboard(filters as BudgetDashboardExecutionFilters),
  });
}

export function useGiofOperationsDashboard(
  filters: GiofOperationsDashboardFilters,
): DashboardHookState<GiofOperationsDashboard> {
  return useCachedDashboardQuery({
    enabled: true,
    key: ["dashboard", "giof-operations", filters],
    tags: [QUERY_TAGS.DASHBOARD, QUERY_TAGS.REQUESTS, QUERY_TAGS.PAYMENTS, QUERY_TAGS.RENDITIONS],
    errorMessage: "Error al cargar dashboard operativo",
    queryFn: () => getGiofOperationsDashboard(filters),
  });
}

export function useOrgUnitExecutionDashboard(
  filters: OrgUnitExecutionDashboardFilters | null,
  options: DashboardHookOptions = {},
): DashboardHookState<OrgUnitExecutionDashboard> {
  const enabled = (options.enabled ?? true) && Boolean(filters?.org_unit_id);
  return useCachedDashboardQuery({
    enabled,
    key: ["dashboard", "org-unit-execution", filters ?? {}],
    tags: [QUERY_TAGS.DASHBOARD, QUERY_TAGS.BUDGET, QUERY_TAGS.POA],
    errorMessage: "Error al cargar Programado vs Ejecutado",
    queryFn: () => getOrgUnitExecutionDashboard(filters as OrgUnitExecutionDashboardFilters),
  });
}

export function useOrgUnitExecutionDashboardOptions(
  filters: OrgUnitExecutionDashboardFilters | null,
  options: DashboardHookOptions = {},
): DashboardHookState<OrgUnitExecutionOptionsResponse> {
  const optionsFilters = filters ? {
      ...filters,
      level: undefined,
      parent_id: undefined,
      group_id: undefined,
      search: undefined,
      top_n: undefined,
  } : null;
  const enabled = (options.enabled ?? true) && Boolean(optionsFilters?.fiscal_year && optionsFilters.selected_month);
  return useCachedDashboardQuery({
    enabled,
    key: ["dashboard", "org-unit-execution-options", optionsFilters],
    tags: [QUERY_TAGS.DASHBOARD_OPTIONS, QUERY_TAGS.BUDGET, QUERY_TAGS.CATALOG],
    errorMessage: "Error al cargar filtros del dashboard",
    queryFn: () => getOrgUnitExecutionDashboardOptions(optionsFilters as OrgUnitExecutionDashboardFilters),
  });
}
