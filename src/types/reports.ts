import type { RequestCurrency, RequestStatus, RequestType } from "@/types/requests";

export const REPORT_DATE_FIELD = {
  CREATED_AT: "created_at",
  SUBMITTED_AT: "submitted_at",
  APPROVED_AT: "approved_at",
  PAID_AT: "paid_at",
  UPDATED_AT: "updated_at",
  PURCHASE_DATE: "purchase_date",
} as const;

export type ReportDateField = (typeof REPORT_DATE_FIELD)[keyof typeof REPORT_DATE_FIELD];

export const REPORT_SORT_FIELD = {
  EXPENSE_DATE: "expense_date",
  AMOUNT: "amount",
  REQUEST_CODE: "request_code",
  CONCEPT: "concept",
  PROVIDER: "provider",
} as const;

export type ReportSortField = (typeof REPORT_SORT_FIELD)[keyof typeof REPORT_SORT_FIELD];

export const REPORT_SORT_DIRECTION = {
  ASC: "asc",
  DESC: "desc",
} as const;

export type ReportSortDirection = (typeof REPORT_SORT_DIRECTION)[keyof typeof REPORT_SORT_DIRECTION];

export interface ReportFilters {
  date_from?: string;
  date_to?: string;
  date_field?: ReportDateField;
  fiscal_year?: number;
  month?: number;
  request_type?: RequestType;
  status?: RequestStatus;
  org_unit_id?: string;
  budget_planning_line_id?: string;
  budget_category_id?: string;
  program_id?: string;
  territory_id?: string;
  funding_source_id?: string;
  currency?: RequestCurrency;
  search?: string;
  provider?: string;
  concept_search?: string;
  min_amount?: number;
  max_amount?: number;
}

export interface ConceptDetailsFilters extends ReportFilters {
  page?: number;
  limit?: number;
  sort?: ReportSortField;
  direction?: ReportSortDirection;
}

export interface ReportTotalByCurrency {
  currency: string;
  amount: number;
  count?: number;
}

export interface RequestsByStatusRow {
  status: string;
  currency: string;
  request_count: number;
  requested_amount: number;
  request_percentage: number;
  amount_percentage: number;
}

export interface RequestsByStatusReport {
  report: "requests-by-status";
  totals: { request_count: number; by_currency: ReportTotalByCurrency[] };
  groups: RequestsByStatusRow[];
}

export interface ExpensesByRequestTypeRow {
  request_type: string;
  currency: string;
  request_count: number;
  payment_count: number;
  executed_amount: number;
  amount_percentage: number;
}

export interface ExpensesByRequestTypeReport {
  report: "expenses-by-request-type";
  totals: {
    request_count: number;
    payment_count: number;
    by_currency: ReportTotalByCurrency[];
  };
  groups: ExpensesByRequestTypeRow[];
}

export interface ExpensesByConceptRow {
  concept: string;
  currency: string;
  row_count: number;
  request_count: number;
  amount: number;
  amount_percentage: number;
}

export interface ExpensesByConceptReport {
  report: "expenses-by-concept";
  totals: {
    row_count: number;
    request_count: number;
    by_currency: ReportTotalByCurrency[];
  };
  groups: ExpensesByConceptRow[];
}

export interface ExpensesByConceptDetailRow {
  source_kind: string;
  request_id: string;
  request_code: string | null;
  request_type: string;
  status: string;
  concept: string;
  detail: string;
  provider: string | null;
  expense_date: string | null;
  paid_at: string | null;
  amount: number;
  currency: string;
  budget_planning_line_id: string | null;
  budget_line_code: string | null;
  org_unit_id: string | null;
  budget_category_id: string | null;
  program_id: string | null;
  territory_id: string | null;
}

export interface ReportPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
}

export interface ExpensesByConceptDetailsReport {
  report: "expenses-by-concept-details";
  pagination: ReportPagination;
  totals: { by_currency: ReportTotalByCurrency[] };
  rows: ExpensesByConceptDetailRow[];
}
