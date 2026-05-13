// -------------------------------------------------------
// Request types — SIG-EPE
// Tipos del frontend alineados a respuestas del backend
// -------------------------------------------------------

export const REQUEST_TYPE = {
  ADVANCE: "ADVANCE",
  REIMBURSEMENT: "REIMBURSEMENT",
  SUPPLIER_PAYMENT: "SUPPLIER_PAYMENT",
  ADVANCE_SETTLEMENT: "ADVANCE_SETTLEMENT",
} as const;

export type RequestType = (typeof REQUEST_TYPE)[keyof typeof REQUEST_TYPE];

export const REQUEST_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  OBSERVED: "OBSERVED",
  IN_VALIDATION: "IN_VALIDATION",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  PAID: "PAID",
  CLOSED: "CLOSED",
  VOIDED: "VOIDED",
} as const;

export type RequestStatus = (typeof REQUEST_STATUS)[keyof typeof REQUEST_STATUS];

export const REQUEST_CURRENCY = {
  PEN: "PEN",
  USD: "USD",
} as const;

export type RequestCurrency = (typeof REQUEST_CURRENCY)[keyof typeof REQUEST_CURRENCY];

export const REQUEST_DOCUMENT_CATEGORY = {
  SUPPORT: "SUPPORT",
  RECEIPT: "RECEIPT",
  QUOTE: "QUOTE",
  CONTRACT: "CONTRACT",
  OTHER: "OTHER",
} as const;

export type RequestDocumentCategory = (typeof REQUEST_DOCUMENT_CATEGORY)[keyof typeof REQUEST_DOCUMENT_CATEGORY];

export const BENEFICIARY_DOCUMENT_TYPE = {
  DNI: "DNI",
  CE: "CE",
  RUC: "RUC",
} as const;

export type BeneficiaryDocumentType = (typeof BENEFICIARY_DOCUMENT_TYPE)[keyof typeof BENEFICIARY_DOCUMENT_TYPE];

export const BANK_CODE = {
  BCP: "BCP",
  BBVA: "BBVA",
  INTERBANK: "INTERBANK",
  SCOTIABANK: "SCOTIABANK",
  BANBIF: "BANBIF",
  PICHINCHA: "PICHINCHA",
  NACION: "NACION",
  COMERCIO: "COMERCIO",
  MIBANCO: "MIBANCO",
  GNB: "GNB",
} as const;

export type BankCode = (typeof BANK_CODE)[keyof typeof BANK_CODE];

export const BANK_NAME_BY_CODE: Record<BankCode, string> = {
  [BANK_CODE.BCP]: "Banco de Crédito del Perú",
  [BANK_CODE.BBVA]: "BBVA Perú",
  [BANK_CODE.INTERBANK]: "Interbank",
  [BANK_CODE.SCOTIABANK]: "Scotiabank Perú",
  [BANK_CODE.BANBIF]: "BanBif",
  [BANK_CODE.PICHINCHA]: "Banco Pichincha",
  [BANK_CODE.NACION]: "Banco de la Nación",
  [BANK_CODE.COMERCIO]: "Banco de Comercio",
  [BANK_CODE.MIBANCO]: "MiBanco",
  [BANK_CODE.GNB]: "Banco GNB Perú",
};

export const ACCOUNT_TYPE = {
  SAVINGS: "SAVINGS",
  CHECKING: "CHECKING",
} as const;

export type AccountType = (typeof ACCOUNT_TYPE)[keyof typeof ACCOUNT_TYPE];

export interface RequestOrgUnitSummary {
  id: string;
  code?: string | null;
  name: string;
  short_name?: string | null;
}

export interface RequestFiscalYearSummary {
  id: string;
  year: number;
  status?: string;
}

export interface RequestCategorySummary {
  id: string;
  code?: string | null;
  name: string;
}

export interface RequestProgramSummary {
  id: string;
  code?: string | null;
  name: string;
}

export interface RequestActionSummary {
  id: string;
  name: string;
}

export interface RequestPlanningLineMonthlySummary {
  month: number;
  planned_amount: number;
  executed_amount: number;
}

export interface RequestPlanningLineLookupItem {
  id: string;
  line_code?: string | null;
  resource_description: string;
  planning_type?: string | null;
  type_resource?: string | null;
  total_cost: number;
  status: string;
  fiscal_year: RequestFiscalYearSummary | null;
  org_unit: RequestOrgUnitSummary | null;
  category: RequestCategorySummary | null;
  program: RequestProgramSummary | null;
  action: RequestActionSummary | null;
  monthly_summary: RequestPlanningLineMonthlySummary[];
}

export interface RequestPlanningLineLookupResponse {
  lines: RequestPlanningLineLookupItem[];
  total: number;
}

export interface RequestBudgetPreview {
  planning_line: RequestPlanningLineLookupItem;
  month: number;
  amount: number;
  org_unit: RequestOrgUnitSummary | null;
  org_unit_ceiling: number | null;
  current_consumed_amount: number;
  submitted_pending_amount: number;
  remaining_ceiling: number | null;
  willExceedOrgUnitCeiling: boolean;
  orgUnitBlockingErrors: string[];
  planned_line_month_amount: number | null;
  planned_line_month_executed_amount: number | null;
  line_consumed_amount: number;
  line_planned_remaining: number | null;
  lineWarning: boolean;
  lineWarningMessage: string | null;
  warnings: string[];
}

export interface PaymentRequestPlanningLine {
  id: string;
  line_code?: string | null;
  resource_description?: string | null;
  fiscalYear?: RequestFiscalYearSummary | null;
  organizationalUnit?: RequestOrgUnitSummary | null;
  budgetCategory?: RequestCategorySummary | null;
}

export interface RequesterSummary {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export interface RequestObservationUserSummary {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export interface RequestObservation {
  id: string;
  payment_request_id: string;
  observer_id: string;
  observer?: RequestObservationUserSummary | null;
  field_reference: string | null;
  comment: string;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestStatusHistoryItem {
  id: string;
  payment_request_id: string;
  from_status: RequestStatus | null;
  to_status: RequestStatus;
  actor_id: string | null;
  actor_role: string | null;
  reason: string | null;
  comment: string | null;
  created_at: string;
}

export interface PaymentRequest {
  id: string;
  request_code: string | null;
  sequential_number: string | null;
  request_type: RequestType;
  status: RequestStatus;
  fiscal_year: number;
  requested_amount: number;
  currency: RequestCurrency;
  concept: string;
  requester_id: string;
  requester?: RequesterSummary | null;
  budget_planning_line_id: string | null;
  budgetPlanningLine?: PaymentRequestPlanningLine | null;
  budget_month: number | null;
  organizational_unit_id: string | null;
  organizationalUnit?: RequestOrgUnitSummary | null;
  scheduled_rendition_at: string | null;
  related_request_id: string | null;
  supplier_ruc: string | null;
  supplier_name: string | null;
  document_type: string | null;
  has_associated_contract: boolean;
  beneficiary_name: string | null;
  beneficiary_document_type: BeneficiaryDocumentType | null;
  beneficiary_document_number: string | null;
  bank_code: BankCode | null;
  bank_name: string | null;
  account_type: AccountType | null;
  bank_account: string | null;
  bank_cci: string | null;
  submitted_at: string | null;
  observed_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  paid_at: string | null;
  disbursed_at: string | null;
  amount_disbursed: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  statusHistory?: RequestStatusHistoryItem[];
  observations?: RequestObservation[];
}

export interface RequestDocument {
  id: string;
  payment_request_id: string;
  document_category: RequestDocumentCategory | string;
  safe_filename: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number | string;
  sha256_hash?: string | null;
  storage_provider?: string | null;
  upload_status?: string | null;
  uploaded_by_id?: string | null;
  created_at: string;
}

export interface UploadRequestDocumentInput {
  file: File;
  document_category: RequestDocumentCategory;
  metadata_json?: Record<string, unknown>;
}

export interface RequestsListResponse {
  requests: PaymentRequest[];
  total: number;
  page: number;
  limit: number;
}

export interface RequestsListFilters {
  page?: number;
  limit?: number;
  status?: RequestStatus;
  request_type?: RequestType;
  budget_planning_line_id?: string;
  org_unit_id?: string;
  search?: string;
}

export interface CreateRequestDto {
  request_type: RequestType;
  budget_planning_line_id: string;
  budget_month: number;
  requested_amount: number;
  currency?: RequestCurrency;
  concept: string;
  scheduled_rendition_at?: string;
  related_request_id?: string;
  supplier_ruc?: string;
  supplier_name?: string;
  document_type?: string;
  has_associated_contract?: boolean;
  beneficiary_name?: string;
  beneficiary_document_type?: BeneficiaryDocumentType;
  beneficiary_document_number?: string;
  bank_code?: BankCode;
  bank_name?: string;
  account_type?: AccountType;
  bank_account?: string;
  bank_cci?: string;
  notes?: string;
}

export type UpdateRequestDto = Partial<CreateRequestDto>;

export interface ObserveRequestDto {
  comment: string;
  field_reference?: string;
}

export interface ApproveRequestDto {
  comment?: string;
}

export interface RejectRequestDto {
  reason: string;
}

export interface BudgetPreviewInput {
  planningLineId?: string;
  month?: number;
  amount?: number;
}
