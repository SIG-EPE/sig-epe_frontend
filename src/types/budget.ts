// -------------------------------------------------------
// Budget types — SIG-EPE
// -------------------------------------------------------

import type { PlanningType } from "@/lib/planning-types";

export const TERRITORY_SELECTION_TARGET_KIND = {
  TERRITORY: "TERRITORY",
  AGGREGATE: "AGGREGATE",
} as const;

export const TERRITORY_SELECTION_AXIS = {
  REGION: "REGION",
  PROVINCIA: "PROVINCIA",
  DISTRITO: "DISTRITO",
} as const;

export type TerritorySelectionAxis =
  (typeof TERRITORY_SELECTION_AXIS)[keyof typeof TERRITORY_SELECTION_AXIS];

export interface PlanningLineTerritoryAxisInput {
  axis: TerritorySelectionAxis;
  territory_id?: string;
  aggregate_option_id?: string;
}

export interface PlanningLineTerritorySelectionInput {
  axes: PlanningLineTerritoryAxisInput[];
}

export interface TerritoryAggregateOptionRelation {
  id: string;
  code: string;
  axis: TerritorySelectionAxis;
  name: string;
  is_active?: boolean;
}

export interface PlanningLineTerritoryAxisSelection {
  axis: TerritorySelectionAxis;
  territory_id: string | null;
  aggregate_option_id: string | null;
  territory: PlanningLineNamedRelation | null;
  aggregate_option: TerritoryAggregateOptionRelation | null;
}

export interface PlanningLineTerritorySelection {
  axes: PlanningLineTerritoryAxisSelection[];
}

export interface PlanningLineFiscalYearRelation {
  id: string;
  year: number;
  status?: string;
}

export interface PlanningLineNamedRelation {
  id: string;
  code?: string;
  name: string;
  short_name?: string;
}

export interface PlanningLineComponentRelation {
  id: string;
  name: string;
}

export interface PlanningLineOperativeActionRelation {
  id: string;
  name: string;
  component?: PlanningLineComponentRelation | null;
}

export interface PlanningLineResourceRelation {
  id: string;
  name: string;
  fullCode: string;
}

export interface PlanningLinePoaHierarchy {
  component: PlanningLineResourceRelation;
  action: PlanningLineResourceRelation;
  resource: PlanningLineResourceRelation;
}

/** Datos de saldo presupuestal devueltos por GET /budget/balance/:fiscalYearId */
export interface BalanceData {
  fiscal_year_id: string;
  total_planned: number;
  total_committed: number;
  total_executed: number;
  monthly_programmed_decimal?: string;
  generated_cost_decimal?: string;
  total_executed_decimal?: string;
  available: number;
  warning: boolean;
  from_cache: boolean;
}

/** Ano fiscal presupuestal */
export interface FiscalYear {
  id: string;
  year: number;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  notes?: string;
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

/** Filtros para la consulta de balance */
export interface BalanceFilters {
  org_unit_id?: string;
  territory_id?: string;
}

/** Planning line interface */
export interface PlanningLine {
  id: string;
  fiscal_year_id: string;
  organizational_unit_id: string;
  program_id: string | null;
  budget_category_id: string;
  planning_type: PlanningType;
  resource_description: string;
  resource_id?: string | null;
  operative_action_id?: string | null;
  territory_id?: string | null;
  importance?: string | null;
  frequency?: string | null;
  unit_price: number | null;
  quantity: number | null;
  total_cost: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  rejection_reason?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  line_code?: string;
  // Relaciones — nombres que devuelve el backend (camelCase en TypeORM)
  fiscalYear?: PlanningLineFiscalYearRelation;
  organizationalUnit?: PlanningLineNamedRelation;
  program?: PlanningLineNamedRelation | null;
  budgetCategory?: PlanningLineNamedRelation;
  territory?: PlanningLineNamedRelation | null;
  territory_selection?: PlanningLineTerritorySelection;
  operativeAction?: PlanningLineOperativeActionRelation | null;
  resource?: PlanningLineResourceRelation | null;
  poaHierarchy?: PlanningLinePoaHierarchy | null;
  // Alias snake_case para compatibilidad con componentes existentes
  organizational_unit?: PlanningLineNamedRelation;
  budget_program?: PlanningLineNamedRelation | null;
  budget_category?: PlanningLineNamedRelation;
  monthlyDistribution?: MonthlyEntry[];
  monthly_distribution?: MonthlyEntry[]; // alias snake_case — usar monthlyDistribution
  fundingSources?: FundingSourceAllocation[];
  partners?: FundingSourceAllocation[];
  source_authority?: PoaSourceAuthorityDetail;
}

export const POA_SOURCE_CELL_KIND = {
  BLANK: "BLANK",
  NUMBER: "NUMBER",
} as const;

export type PoaSourceCellKind =
  (typeof POA_SOURCE_CELL_KIND)[keyof typeof POA_SOURCE_CELL_KIND];

export const POA_SOURCE_SEMANTICS_VERSION = "poa-source-months-v1" as const;

export interface PoaSourceMonth {
  month: number;
  cell_kind: PoaSourceCellKind;
  unscaled: string | null;
  scale: number | null;
  value: string | null;
}

export interface PoaSourceStatistics {
  semanticsVersion: typeof POA_SOURCE_SEMANTICS_VERSION;
  sum: string | null;
  average: string | null;
  observedCount: number;
  blankCount: number;
  explicitZeroCount: number;
  expectedCount: number;
  coverage: string | null;
  completeness: string;
}

export interface PoaSourceAuthorityDetail {
  semantics_version: typeof POA_SOURCE_SEMANTICS_VERSION;
  source_months: PoaSourceMonth[];
  statistics: PoaSourceStatistics;
  [key: string]: unknown;
}

export const MONTHLY_EXECUTION_DETAIL_SOURCE = {
  PAYMENT_REQUEST: "PAYMENT_REQUEST",
  MANUAL: "MANUAL",
} as const;

export type MonthlyExecutionDetailSource =
  (typeof MONTHLY_EXECUTION_DETAIL_SOURCE)[keyof typeof MONTHLY_EXECUTION_DETAIL_SOURCE];

export interface MonthlyExecutionDetail {
  id: string;
  source: MonthlyExecutionDetailSource;
  requestId?: string | null;
  requestCode?: string | null;
  concept: string | null;
  amount: number;
  paidAt?: string | null;
  createdAt?: string | null;
  status?: string | null;
  type?: string | null;
}

export interface MonthlyEntry {
  id: string;
  planning_line_id: string;
  month: number;
  planned_amount: number;
  executed_amount: string;
  monthly_programmed_decimal?: string;
  executed_amount_decimal?: string;
  execution_provenance?: PoaExecutionProvenance;
  execution_details?: MonthlyExecutionDetail[];
}

export const POA_EXECUTION_SYSTEM_WINNER = {
  RENDITION: "RENDITION",
  PAID_ALLOCATION: "PAID_ALLOCATION",
  PAID_LEGACY: "PAID_LEGACY",
} as const;

export type PoaExecutionSystemWinner =
  (typeof POA_EXECUTION_SYSTEM_WINNER)[keyof typeof POA_EXECUTION_SYSTEM_WINNER];

export interface PoaExecutionSystemLineage {
  lineage_key: string;
  winner: PoaExecutionSystemWinner;
  amount: string;
}

export interface PoaExecutionProvenance {
  imported: string;
  manual: string;
  system_rendition: string;
  system_paid_allocation: string;
  system_paid_legacy: string;
  total: string;
  system_lineages: PoaExecutionSystemLineage[];
}

export interface FundingSourceAllocation {
  id: string;
  planning_line_id: string;
  funding_source_id: string;
  allocated_amount?: number | null;
  percentage?: number | null;
  /** Relación cargada por TypeORM — el backend serializa en camelCase */
  fundingSource?: { id: string; code: string; name: string };
}

/** Ejecución manual de presupuesto por mes */
export interface ManualExecution {
  id: string;
  planning_line_id: string;
  month: number;
  amount: number;
  concept: string;
  execution_date: string;
  registered_by: string;
  created_at: string;
}

/** Estadísticas de líneas de planificación agrupadas por estado */
export interface PlanningLineStats {
  DRAFT: { count: number; total: number };
  SUBMITTED: { count: number; total: number };
  APPROVED: { count: number; total: number };
  REJECTED: { count: number; total: number };
}

/** Respuesta del backend cuando las estadísticas vienen envueltas */
export interface PlanningLineStatsResponse {
  fiscal_year_id?: string;
  org_unit_id?: string | null;
  stats: PlanningLineStats;
}

/** Verificación de techo presupuestal */
export interface CeilingCheck {
  ceiling: number | null;
  used: number;
  available: number | null;
  warning: boolean;
}

/** @deprecated Use FundingSourceAllocation instead */
export interface Partner {
  id: string;
  planning_line_id: string;
  partner_id: string;
  allocated_amount: number;
  percentage: number;
  partner?: { id: string; code: string; name: string };
}

