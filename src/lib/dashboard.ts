import { api } from "@/lib/api-client";
import type {
  BudgetDashboardExecution,
  BudgetDashboardExecutionFilters,
  GiofOperationsDashboard,
  GiofOperationsDashboardFilters,
  OrgUnitExecutionDashboard,
  OrgUnitExecutionDashboardFilters,
} from "@/types/dashboard";

function appendParam(params: URLSearchParams, key: string, value: string | number | undefined) {
  if (value !== undefined && value !== "") {
    params.set(key, String(value));
  }
}

export function buildBudgetExecutionDashboardPath(filters: BudgetDashboardExecutionFilters): string {
  const params = new URLSearchParams();
  appendParam(params, "fiscal_year_id", filters.fiscal_year_id);
  appendParam(params, "org_unit_id", filters.org_unit_id);
  appendParam(params, "territory_id", filters.territory_id);
  appendParam(params, "program_id", filters.program_id);
  appendParam(params, "budget_category_id", filters.budget_category_id);

  return `/budget/dashboard/execution?${params.toString()}`;
}

export function buildGiofOperationsDashboardPath(filters: GiofOperationsDashboardFilters = {}): string {
  const params = new URLSearchParams();
  appendParam(params, "date_from", filters.date_from);
  appendParam(params, "date_to", filters.date_to);
  appendParam(params, "fiscal_year", filters.fiscal_year);
  appendParam(params, "org_unit_id", filters.org_unit_id);
  appendParam(params, "territory_id", filters.territory_id);

  const queryString = params.toString();
  return `/dashboard/giof/operations${queryString ? `?${queryString}` : ""}`;
}

export function buildOrgUnitExecutionDashboardPath(filters: OrgUnitExecutionDashboardFilters = {}): string {
  const params = new URLSearchParams();
  appendParam(params, "fiscal_year_id", filters.fiscal_year_id);
  appendParam(params, "fiscal_year", filters.fiscal_year);
  appendParam(params, "org_unit_id", filters.org_unit_id);
  appendParam(params, "month_from", filters.month_from);
  appendParam(params, "month_to", filters.month_to);
  appendParam(params, "level", filters.level);
  appendParam(params, "parent_id", filters.parent_id);
  appendParam(params, "group_id", filters.group_id);

  const queryString = params.toString();
  return `/budget/dashboard/org-unit-execution${queryString ? `?${queryString}` : ""}`;
}

export function getBudgetExecutionDashboard(
  filters: BudgetDashboardExecutionFilters,
): Promise<BudgetDashboardExecution> {
  return api.get<BudgetDashboardExecution>(buildBudgetExecutionDashboardPath(filters));
}

export function getGiofOperationsDashboard(
  filters?: GiofOperationsDashboardFilters,
): Promise<GiofOperationsDashboard> {
  return api.get<GiofOperationsDashboard>(buildGiofOperationsDashboardPath(filters));
}

export function getOrgUnitExecutionDashboard(
  filters?: OrgUnitExecutionDashboardFilters,
): Promise<OrgUnitExecutionDashboard> {
  return api.get<OrgUnitExecutionDashboard>(buildOrgUnitExecutionDashboardPath(filters));
}
