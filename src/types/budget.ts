// -------------------------------------------------------
// Budget types — SIG-EPE
// -------------------------------------------------------

/** Datos de saldo presupuestal devueltos por GET /budget/balance/:fiscalYearId */
export interface BalanceData {
  fiscal_year_id: string;
  total_planned: number;
  total_committed: number;
  total_executed: number;
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
  planning_type: "PROGRAMA" | "PROYECTO" | "GESTIÓN";
  resource_description: string;
  operative_action_id?: string | null;
  territory_id?: string | null;
  importance?: string | null;
  frequency?: string | null;
  unit_price: number;
  quantity: number;
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
  organizationalUnit?: { id: string; code: string; name: string; short_name?: string };
  program?: { id: string; code: string; name: string } | null;
  budgetCategory?: { id: string; code: string; name: string };
  // Alias snake_case para compatibilidad con componentes existentes
  organizational_unit?: { id: string; code: string; name: string; short_name?: string };
  budget_program?: { id: string; code: string; name: string } | null;
  budget_category?: { id: string; code: string; name: string };
  monthly_distribution?: MonthlyEntry[];
  fundingSources?: FundingSourceAllocation[];
  partners?: FundingSourceAllocation[];
}

export interface MonthlyEntry {
  id: string;
  planning_line_id: string;
  month: number;
  planned_amount: number;
  executed_amount: number;
}

export interface FundingSourceAllocation {
  id: string;
  planning_line_id: string;
  funding_source_id: string;
  allocated_amount: number;
  percentage: number;
  funding_source?: { id: string; code: string; name: string };
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


