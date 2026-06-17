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
