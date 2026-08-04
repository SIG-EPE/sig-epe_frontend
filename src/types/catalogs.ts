import type { PlanningType } from "@/lib/planning-types";

// -------------------------------------------------------
// Catalog types — SIG-EPE
// Tipos TypeScript para todos los catálogos del sistema
// -------------------------------------------------------

// -------------------------------------------------------
// BudgetProgram — Programas/Proyectos/Gestiones
// -------------------------------------------------------

export interface BudgetProgram {
  id: string;
  code: string;
  name: string;
  /** El backend serializa como camelCase desde la entidad TypeORM */
  planningType?: PlanningType | null;
  territory_id?: string | null;
  is_active: boolean;
  territory?: { id: string; code: string; name: string } | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBudgetProgramDto {
  code: string;
  name: string;
  /** El backend espera camelCase: planningType */
  planningType?: PlanningType;
  territory_id?: string;
}

export interface UpdateBudgetProgramDto {
  code?: string;
  name?: string;
  /** El backend espera camelCase: planningType */
  planningType?: PlanningType;
  territory_id?: string;
}

// -------------------------------------------------------
// FundingSourceType — Tipos de fuente de financiamiento
// -------------------------------------------------------

export interface FundingSourceType {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
}

export interface CreateFundingSourceTypeDto {
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface UpdateFundingSourceTypeDto {
  name?: string;
  description?: string;
  is_active?: boolean;
}

// -------------------------------------------------------
// FundingSource — Fuentes de financiamiento (ex BudgetPartner)
// -------------------------------------------------------

export interface FundingSource {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  fundingSourceType?: FundingSourceType | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** @deprecated Use FundingSource instead */
export type BudgetPartner = FundingSource;

export interface CreateFundingSourceDto {
  code: string;
  name: string;
  description?: string;
  fundingSourceTypeId: string;
}

/** @deprecated Use CreateFundingSourceDto instead */
export type CreateBudgetPartnerDto = CreateFundingSourceDto;

export interface UpdateFundingSourceDto {
  code?: string;
  name?: string;
  description?: string;
  fundingSourceTypeId?: string;
}

/** @deprecated Use UpdateFundingSourceDto instead */
export type UpdateBudgetPartnerDto = UpdateFundingSourceDto;

// -------------------------------------------------------
// BudgetCategory — Tipos de recurso
// -------------------------------------------------------

export interface BudgetCategory {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateBudgetCategoryDto {
  name: string;
  description?: string;
}

export interface UpdateBudgetCategoryDto {
  name?: string;
  description?: string;
}

// -------------------------------------------------------
// Territory — Territorios jerárquicos
// -------------------------------------------------------

export type TerritoryLevel = "REGION" | "PROVINCIA" | "DISTRITO" | "COMUNIDAD";

export interface Territory {
  id: string;
  code: string;
  name: string;
  level: TerritoryLevel;
  parent_id?: string | null;
  ubigeo_code?: string | null;
  is_active: boolean;
  parent?: { id: string; code: string; name: string } | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTerritoryDto {
  code: string;
  name: string;
  level: TerritoryLevel;
  parent_id?: string;
  ubigeo_code?: string;
}

export interface UpdateTerritoryDto {
  code?: string;
  name?: string;
  level?: TerritoryLevel;
  parent_id?: string;
  ubigeo_code?: string;
}

// -------------------------------------------------------
// OrganizationalUnit — Unidades orgánicas
// -------------------------------------------------------

export interface OrganizationalUnit {
  id: string;
  code: string | null;
  name: string;
  short_name?: string | null;
  /** ID de la UO padre (auto-referencial) */
  parentId?: string | null;
  /** Nombre del responsable de la UO */
  responsibleName?: string | null;
  /** Techo presupuestal asignado a la UO (NUMERIC 15,2) */
  budgetCeiling?: number | null;
  /** UOs hijas (eager load nivel 1) */
  children?: OrganizationalUnit[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateOrganizationalUnitDto {
  code: string;
  name: string;
  short_name?: string;
  parentId?: string | null;
  responsibleName?: string | null;
  budgetCeiling?: number | null;
}

export interface UpdateOrganizationalUnitDto {
  code?: string;
  name?: string;
  short_name?: string;
  parentId?: string | null;
  responsibleName?: string | null;
  budgetCeiling?: number | null;
}

// -------------------------------------------------------
// StrategicComponent — Componentes estratégicos
// -------------------------------------------------------

export interface StrategicComponent {
  id: string;
  name: string;
  programId: string;
  programName?: string | null;
  sequenceNumber: string;
  fullCode: string;
  isActive: boolean;
  publishedAt?: string | null;
  dependencies?: PoaCatalogDependencyCounts;
}

// -------------------------------------------------------
// OperativeAction — Acciones operativas
// -------------------------------------------------------

export interface OperativeAction {
  id: string;
  name: string;
  componentId: string;
  componentName?: string | null;
  sequenceNumber: string;
  fullCode: string;
  isActive: boolean;
  publishedAt?: string | null;
  dependencies?: PoaCatalogDependencyCounts;
}

export interface PoaResource {
  id: string;
  name: string;
  actionId: string;
  actionName?: string | null;
  componentId?: string;
  componentName?: string | null;
  sequenceNumber: string;
  fullCode: string;
  isActive: boolean;
  publishedAt?: string | null;
  dependencies?: PoaCatalogDependencyCounts;
}

export interface CreatePoaResourceDto {
  name: string;
  action_id: string;
}

export interface PoaCatalogDependencyCounts {
  total: number;
  activeChildren?: number;
  planningLines?: number;
}

export interface PoaHierarchyProgram {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export interface PoaHierarchyData {
  programs: PoaHierarchyProgram[];
  components: StrategicComponent[];
  actions: OperativeAction[];
  resources: PoaResource[];
}
