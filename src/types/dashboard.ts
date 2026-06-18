// -------------------------------------------------------
// Dashboard DTO contracts — SIG-EPE
// Mirrors backend dashboard responses. Keep null explicit.
// -------------------------------------------------------

export const BUDGET_DASHBOARD_ALERT_SEVERITY = {
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "critical",
} as const;

export type BudgetDashboardAlertSeverity =
  (typeof BUDGET_DASHBOARD_ALERT_SEVERITY)[keyof typeof BUDGET_DASHBOARD_ALERT_SEVERITY];

export interface BudgetDashboardExecutionFilters {
  fiscal_year_id: string;
  org_unit_id?: string;
  territory_id?: string;
  program_id?: string;
  budget_category_id?: string;
}

export interface BudgetDashboardTotals {
  allocated: number;
  committed: number;
  executed: number;
  rendered: number | null;
  available: number;
  execution_rate: number | null;
}

export interface BudgetDashboardMonthlySeriesItem {
  month: number;
  planned: number;
  executed: number;
  rendered: number | null;
}

export interface BudgetDashboardBreakdownItem {
  id: string | null;
  label: string;
  territory_code?: string | null;
  territory_ubigeo_code?: string | null;
  territory_level?: string | null;
  province_name?: string | null;
  region_name?: string | null;
  display_label?: string | null;
  is_synthetic_territory?: boolean;
  planned: number;
  committed: number;
  executed: number;
  rendered: number | null;
  execution_rate: number | null;
}

export interface BudgetDashboardBreakdowns {
  by_category: BudgetDashboardBreakdownItem[];
  by_program: BudgetDashboardBreakdownItem[];
  by_territory: BudgetDashboardBreakdownItem[];
}

export interface BudgetDashboardAlert {
  code: string;
  severity: BudgetDashboardAlertSeverity;
  label?: string | null;
  value?: number | null;
  threshold?: number | null;
}

export interface BudgetDashboardExecution {
  fiscal_year_id: string;
  generated_at: string;
  totals: BudgetDashboardTotals;
  series: BudgetDashboardMonthlySeriesItem[];
  breakdowns: BudgetDashboardBreakdowns;
  alerts: BudgetDashboardAlert[];
}

export const ORG_UNIT_EXECUTION_LEVEL = {
  AREA: "area",
  COMPONENT: "component",
  OPERATIVE_ACTION: "operative_action",
  RESOURCE: "resource",
} as const;

export type OrgUnitExecutionLevel =
  (typeof ORG_UNIT_EXECUTION_LEVEL)[keyof typeof ORG_UNIT_EXECUTION_LEVEL];

export interface OrgUnitExecutionDashboardFilters {
  fiscal_year_id?: string;
  fiscal_year?: number;
  org_unit_id?: string;
  program_id?: string;
  component_id?: string;
  operative_action_id?: string;
  resource_id?: string;
  funding_source_id?: string;
  selected_month?: number;
  month_from?: number;
  month_to?: number;
  level?: OrgUnitExecutionLevel;
  parent_id?: string;
  group_id?: string;
  search?: string;
  top_n?: number;
}

export interface OrgUnitExecutionAppliedFilters {
  fiscal_year_id: string;
  fiscal_year?: number;
  org_unit_id?: string;
  program_id?: string;
  component_id?: string;
  operative_action_id?: string;
  resource_id?: string;
  funding_source_id?: string;
  selected_month?: number;
  month_from: number;
  month_to: number;
  level: OrgUnitExecutionLevel;
  parent_id: string | null;
  search?: string;
  top_n?: number;
}

export interface OrgUnitExecutionKpis {
  annual_programmed: number;
  period_programmed: number;
  period_executed: number;
  period_variance: number;
  not_executed: number;
  excedente: number;
  remaining_programmed: number;
  execution_rate: number | null;
  currency: string | null;
}

export interface OrgUnitExecutionTotals {
  programmed: number;
  executed: number;
  variance: number;
  execution_rate: number | null;
  currency: string | null;
}

export interface OrgUnitExecutionRow extends OrgUnitExecutionTotals {
  id: string | null;
  code: string | null;
  name: string;
  level: OrgUnitExecutionLevel;
  parent_id: string | null;
  has_children: boolean;
}

export interface OrgUnitExecutionVarianceRow extends OrgUnitExecutionRow {
  not_executed: number;
  excedente: number;
}

export interface OrgUnitExecutionOption {
  id: string;
  label: string;
  code: string | null;
  parent_id: string | null;
}

export interface OrgUnitExecutionOptions {
  org_units: OrgUnitExecutionOption[];
  programs: OrgUnitExecutionOption[];
  components: OrgUnitExecutionOption[];
  operative_actions: OrgUnitExecutionOption[];
  resources: OrgUnitExecutionOption[];
  funding_sources: OrgUnitExecutionOption[];
}

export interface OrgUnitExecutionBreadcrumb {
  level: OrgUnitExecutionLevel;
  id: string | null;
  label: string;
}

export interface OrgUnitExecutionMonthly {
  month: number;
  programmed: number;
  executed: number;
}

export interface OrgUnitExecutionWarning {
  code: string;
  message: string;
}

export interface OrgUnitExecutionDashboard {
  fiscal_year_id: string;
  generated_at: string;
  execution_semantics: "poa_spent_v1";
  applied_filters: OrgUnitExecutionAppliedFilters;
  totals: OrgUnitExecutionTotals;
  kpis?: OrgUnitExecutionKpis;
  rows: OrgUnitExecutionRow[];
  no_ejecutado_rows?: OrgUnitExecutionVarianceRow[];
  monthly: OrgUnitExecutionMonthly[];
  filter_options?: OrgUnitExecutionOptions;
  breadcrumbs?: OrgUnitExecutionBreadcrumb[];
  current_filters?: OrgUnitExecutionAppliedFilters;
  warnings: OrgUnitExecutionWarning[];
}

export interface OrgUnitExecutionOptionsResponse {
  fiscal_year_id: string;
  applied_filters: OrgUnitExecutionAppliedFilters;
  options: OrgUnitExecutionOptions;
  warnings: OrgUnitExecutionWarning[];
}

export interface GiofOperationsDashboardFilters {
  date_from?: string;
  date_to?: string;
  fiscal_year?: number;
  org_unit_id?: string;
  territory_id?: string;
}

export interface GiofOperationsSummary {
  backlog_count: number;
  pending_review_count: number;
  approved_pending_payment_count: number;
  overdue_count: number;
  in_risk_count: number;
}

export interface GiofOperationsFunnelItem {
  status: string;
  count: number;
  amount: number;
}

export interface GiofOperationsAgingBucket {
  label: string;
  min_days: number;
  max_days: number | null;
  count: number;
}

export interface GiofOperationsAging {
  buckets: GiofOperationsAgingBucket[];
  average_days: number | null;
}

export interface GiofOperationsPayments {
  pending_count: number;
  paid_count: number;
  pending_amount: number;
  paid_amount: number;
}

export interface GiofOperationsRenditions {
  pending: number;
  overdue: number;
  in_review: number;
  observed: number;
  settled: number;
}

export interface GiofOperationsWorkloadByManager {
  user_id: string | null;
  name: string;
  count: number;
  oldest_days: number | null;
}

export interface GiofOperationsException {
  type: string;
  count: number;
  amount: number | null;
}

export interface GiofOperationsDashboard {
  generated_at: string;
  applied_filters: GiofOperationsDashboardFilters;
  summary: GiofOperationsSummary;
  funnel: GiofOperationsFunnelItem[];
  aging: GiofOperationsAging;
  payments: GiofOperationsPayments;
  renditions: GiofOperationsRenditions;
  workload_by_manager: GiofOperationsWorkloadByManager[];
  exceptions: GiofOperationsException[];
}
