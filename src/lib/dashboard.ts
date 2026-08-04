import { api, type ApiDownloadResult } from "@/lib/api-client";
import type {
  BudgetDashboardExecution,
  BudgetDashboardExecutionFilters,
  GiofOperationsDashboard,
  GiofOperationsDashboardFilters,
  OrgUnitExecutionDashboard,
  OrgUnitExecutionDashboardFilters,
  OrgUnitExecutionOptionsResponse,
} from "@/types/dashboard";

export const POA_EXPORT_CONTENT_LABEL = "fuente exacta + datos actuales" as const;

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
  appendParam(params, "measure_authority", filters.measure_authority);

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
  appendParam(params, "program_id", filters.program_id);
  appendParam(params, "component_id", filters.component_id);
  appendParam(params, "operative_action_id", filters.operative_action_id);
  appendParam(params, "resource_id", filters.resource_id);
  appendParam(params, "funding_source_id", filters.funding_source_id);
  appendParam(params, "selected_month", filters.selected_month);
  appendParam(params, "month_from", filters.month_from);
  appendParam(params, "month_to", filters.month_to);
  appendParam(params, "level", filters.level);
  appendParam(params, "parent_id", filters.parent_id);
  appendParam(params, "group_id", filters.group_id);
  appendParam(params, "search", filters.search);
  appendParam(params, "top_n", filters.top_n);
  appendParam(params, "measure_authority", filters.measure_authority);
  const queryString = params.toString();
  return `/budget/dashboard/org-unit-execution${queryString ? `?${queryString}` : ""}`;
}

export function buildOrgUnitExecutionExportPath(filters: OrgUnitExecutionDashboardFilters = {}): string {
  const params = new URLSearchParams();
  appendParam(params, "fiscal_year_id", filters.fiscal_year_id);
  appendParam(params, "fiscal_year", filters.fiscal_year);
  appendParam(params, "org_unit_id", filters.org_unit_id);
  appendParam(params, "program_id", filters.program_id);
  appendParam(params, "component_id", filters.component_id);
  appendParam(params, "operative_action_id", filters.operative_action_id);
  appendParam(params, "resource_id", filters.resource_id);
  appendParam(params, "funding_source_id", filters.funding_source_id);
  appendParam(params, "selected_month", filters.selected_month);
  appendParam(params, "month_from", filters.month_from);
  appendParam(params, "month_to", filters.month_to);
  appendParam(params, "level", filters.level);
  appendParam(params, "parent_id", filters.parent_id);
  appendParam(params, "group_id", filters.group_id);
  appendParam(params, "search", filters.search);
  appendParam(params, "measure_authority", filters.measure_authority);

  const queryString = params.toString();
  return `/budget/dashboard/org-unit-execution/export.xlsx${queryString ? `?${queryString}` : ""}`;
}

export function buildOrgUnitExecutionDashboardOptionsPath(filters: OrgUnitExecutionDashboardFilters = {}): string {
  const dashboardPath = buildOrgUnitExecutionDashboardPath(filters);
  return dashboardPath.replace("/budget/dashboard/org-unit-execution", "/budget/dashboard/org-unit-execution/options");
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

export function downloadOrgUnitExecutionReport(
  filters?: OrgUnitExecutionDashboardFilters,
): Promise<ApiDownloadResult> {
  return api.download(buildOrgUnitExecutionExportPath(filters));
}

export function saveDownloadedDashboardReport(download: ApiDownloadResult, fallbackFilename: string): void {
  const href = URL.createObjectURL(download.blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = download.filename ?? fallbackFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export function getOrgUnitExecutionDashboardOptions(
  filters?: OrgUnitExecutionDashboardFilters,
): Promise<OrgUnitExecutionOptionsResponse> {
  return api.get<OrgUnitExecutionOptionsResponse>(buildOrgUnitExecutionDashboardOptionsPath(filters));
}
