// -------------------------------------------------------
import type { GiofWorkMetadata, GiofWorkScope } from "@/types/giof-work";
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

export type RequestStatus =
  (typeof REQUEST_STATUS)[keyof typeof REQUEST_STATUS];

export const DRIVE_SYNC_STATUS = {
  NOT_CONFIGURED: "NOT_CONFIGURED",
  PENDING: "PENDING",
  SYNCED: "SYNCED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
} as const;

export type DriveSyncStatus =
  (typeof DRIVE_SYNC_STATUS)[keyof typeof DRIVE_SYNC_STATUS];

export const REQUEST_LIST_DATE_FIELD = {
  CREATED_AT: "created_at",
  SUBMITTED_AT: "submitted_at",
  APPROVED_AT: "approved_at",
  PAID_AT: "paid_at",
  UPDATED_AT: "updated_at",
} as const;

export type RequestListDateField =
  (typeof REQUEST_LIST_DATE_FIELD)[keyof typeof REQUEST_LIST_DATE_FIELD];

export const RENDITION_STATUS = {
  PENDING: "PENDING",
  OVERDUE: "OVERDUE",
  IN_REVIEW: "IN_REVIEW",
  OBSERVED: "OBSERVED",
  SETTLED: "SETTLED",
} as const;

export type RenditionStatus =
  (typeof RENDITION_STATUS)[keyof typeof RENDITION_STATUS];

export const RENDITION_DEADLINE_STATE = {
  NONE: "NONE",
  OPEN: "OPEN",
  DUE_TODAY: "DUE_TODAY",
  OVERDUE: "OVERDUE",
  PRESENTED: "PRESENTED",
  COMPLETED: "COMPLETED",
} as const;

export type RenditionDeadlineState =
  (typeof RENDITION_DEADLINE_STATE)[keyof typeof RENDITION_DEADLINE_STATE];

export interface RenditionDeadlineFields {
  /** Canonical Lima calendar date. Optional only during the staggered API rollout. */
  deadline_date?: string | null;
  /** Derived deadline metadata; it is not a persisted rendition lifecycle. */
  deadline_state?: RenditionDeadlineState;
  /** Signed calendar-day delta for active deadlines. */
  calendar_days_to_deadline?: number | null;
}

export const RENDITION_BUCKET = {
  DUE_SOON: "due_soon",
} as const;

export type RenditionBucket =
  (typeof RENDITION_BUCKET)[keyof typeof RENDITION_BUCKET];

export const RENDITION_DEADLINE_BUCKET = {
  NONE: "none",
  DUE_TODAY: "due_today",
  DUE_SOON: "due_soon",
  OVERDUE: "overdue",
} as const;

export type RenditionDeadlineBucket =
  (typeof RENDITION_DEADLINE_BUCKET)[keyof typeof RENDITION_DEADLINE_BUCKET];

export const RENDITION_SORT_FIELD = {
  LAST_ACTIVITY: "last_activity",
  DUE_DATE: "due_date",
  PAID_AT: "paid_at",
} as const;

export type RenditionSortField =
  (typeof RENDITION_SORT_FIELD)[keyof typeof RENDITION_SORT_FIELD];

export const RENDITION_SORT_DIRECTION = {
  ASC: "asc",
  DESC: "desc",
} as const;

export type RenditionSortDirection =
  (typeof RENDITION_SORT_DIRECTION)[keyof typeof RENDITION_SORT_DIRECTION];

export const REQUEST_CURRENCY = {
  PEN: "PEN",
  USD: "USD",
} as const;

export type RequestCurrency =
  (typeof REQUEST_CURRENCY)[keyof typeof REQUEST_CURRENCY];

export const REQUEST_DOCUMENT_CATEGORY = {
  PXQ: "PXQ",
  REQUEST_SUPPORT: "REQUEST_SUPPORT",
  RECEIPT: "RECEIPT",
  CONTRACT: "CONTRACT",
  SETTLEMENT_REPORT: "SETTLEMENT_REPORT",
  RETURN_PROOF: "RETURN_PROOF",
  PAYMENT_PROOF: "PAYMENT_PROOF",
  OTHER: "OTHER",
} as const;

export type RequestDocumentCategory =
  (typeof REQUEST_DOCUMENT_CATEGORY)[keyof typeof REQUEST_DOCUMENT_CATEGORY];

export const REQUEST_DOCUMENT_STORAGE_PROVIDER = {
  LOCAL: "LOCAL",
  NOOP: "NOOP",
  DRIVE: "DRIVE",
  AZURE_BLOB: "AZURE_BLOB",
} as const;

export type RequestDocumentStorageProvider =
  (typeof REQUEST_DOCUMENT_STORAGE_PROVIDER)[keyof typeof REQUEST_DOCUMENT_STORAGE_PROVIDER];

export const REQUEST_DOCUMENT_UPLOAD_STATUS = {
  TEMPORARY: "TEMPORARY",
  PERMANENT: "PERMANENT",
  SYNC_PENDING: "SYNC_PENDING",
  SYNCED: "SYNCED",
  FAILED: "FAILED",
} as const;

export type RequestDocumentUploadStatus =
  (typeof REQUEST_DOCUMENT_UPLOAD_STATUS)[keyof typeof REQUEST_DOCUMENT_UPLOAD_STATUS];

export const REQUEST_DOCUMENT_SCOPE_TYPE = {
  REQUEST: "REQUEST",
  ALLOCATION: "ALLOCATION",
} as const;

export type RequestDocumentScopeType =
  (typeof REQUEST_DOCUMENT_SCOPE_TYPE)[keyof typeof REQUEST_DOCUMENT_SCOPE_TYPE];

export const REQUEST_RECEIPT_OCR_STATUS = {
  MANUAL: "MANUAL",
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  REQUIRES_REVIEW: "REQUIRES_REVIEW",
} as const;

export type RequestReceiptOcrStatus =
  (typeof REQUEST_RECEIPT_OCR_STATUS)[keyof typeof REQUEST_RECEIPT_OCR_STATUS];

export const REQUEST_RECEIPT_DUPLICATE_STATUS = {
  UNIQUE: "UNIQUE",
  POSSIBLE_DUPLICATE: "POSSIBLE_DUPLICATE",
  DUPLICATE_CONFIRMED: "DUPLICATE_CONFIRMED",
  IGNORED: "IGNORED",
} as const;

export type RequestReceiptDuplicateStatus =
  (typeof REQUEST_RECEIPT_DUPLICATE_STATUS)[keyof typeof REQUEST_RECEIPT_DUPLICATE_STATUS];

export const REQUEST_RECEIPT_TYPE = {
  INVOICE: "INVOICE",
  FEE_RECEIPT: "FEE_RECEIPT",
  SALES_RECEIPT: "SALES_RECEIPT",
  TICKET: "TICKET",
  OTHER: "OTHER",
} as const;

export type RequestReceiptType =
  (typeof REQUEST_RECEIPT_TYPE)[keyof typeof REQUEST_RECEIPT_TYPE];

export const REQUEST_RENDITION_REPORT_STATUS = {
  DRAFT: "DRAFT",
  READY: "READY",
  SUBMITTED: "SUBMITTED",
  EXPORT_PENDING: "EXPORT_PENDING",
  EXPORTED: "EXPORTED",
  EXPORT_FAILED: "EXPORT_FAILED",
  OBSERVED: "OBSERVED",
} as const;

export type RequestRenditionReportStatus =
  (typeof REQUEST_RENDITION_REPORT_STATUS)[keyof typeof REQUEST_RENDITION_REPORT_STATUS];

export const REQUEST_RENDITION_EXPORT_PENDING_STATE = {
  IN_PROGRESS: "IN_PROGRESS",
  STALE_RETRY_AVAILABLE: "STALE_RETRY_AVAILABLE",
} as const;

export type RequestRenditionExportPendingState =
  (typeof REQUEST_RENDITION_EXPORT_PENDING_STATE)[keyof typeof REQUEST_RENDITION_EXPORT_PENDING_STATE];

export const REQUEST_RENDITION_ROW_TYPE = {
  OCR_RECEIPT: "OCR_RECEIPT",
  MANUAL_EXTRA: "MANUAL_EXTRA",
} as const;

export type RequestRenditionRowType =
  (typeof REQUEST_RENDITION_ROW_TYPE)[keyof typeof REQUEST_RENDITION_ROW_TYPE];

export const REQUEST_RENDITION_ROW_REVIEW_STATUS = {
  DRAFT: "DRAFT",
  REVIEWED: "REVIEWED",
  SUBMIT_READY: "SUBMIT_READY",
} as const;

export type RequestRenditionRowReviewStatus =
  (typeof REQUEST_RENDITION_ROW_REVIEW_STATUS)[keyof typeof REQUEST_RENDITION_ROW_REVIEW_STATUS];

export const REQUEST_RENDITION_LINE_RETURN_STATUS = {
  DRAFT: "DRAFT",
  VALID: "VALID",
  MISMATCH: "MISMATCH",
  OBSERVED: "OBSERVED",
} as const;

export type RequestRenditionLineReturnStatus =
  (typeof REQUEST_RENDITION_LINE_RETURN_STATUS)[keyof typeof REQUEST_RENDITION_LINE_RETURN_STATUS];

export const LINE_RETURN_VALIDATION_STATUS = {
  NOT_REQUIRED: "NOT_REQUIRED",
  MISSING: "MISSING",
  MISSING_PROOF: "MISSING_PROOF",
  MISSING_JUSTIFICATION: "MISSING_JUSTIFICATION",
  MISMATCH: "MISMATCH",
  VALID: "VALID",
  EXCESS: "EXCESS",
  MISSING_EXECUTION: "MISSING_EXECUTION",
} as const;

export type LineReturnValidationStatus =
  (typeof LINE_RETURN_VALIDATION_STATUS)[keyof typeof LINE_RETURN_VALIDATION_STATUS];

export const REXAN_OUTCOME = {
  EXACT: "EXACT",
  DEVOLUCION: "DEVOLUCION",
  EXCESS: "EXCESS",
} as const;

export type RexanOutcome = (typeof REXAN_OUTCOME)[keyof typeof REXAN_OUTCOME];

export const BENEFICIARY_DOCUMENT_TYPE = {
  DNI: "DNI",
  CE: "CE",
  RUC: "RUC",
} as const;

export type BeneficiaryDocumentType =
  (typeof BENEFICIARY_DOCUMENT_TYPE)[keyof typeof BENEFICIARY_DOCUMENT_TYPE];

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
  OTROS_BANCOS: "OTROS_BANCOS",
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
  [BANK_CODE.OTROS_BANCOS]: "Otros Bancos",
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
  component?: RequestComponentSummary | null;
}

export interface RequestComponentSummary {
  id: string;
  name: string;
}

export interface RequestTerritorySummary {
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
  unit_price?: number | null;
  quantity?: number | null;
  total_cost: number;
  status: string;
  fiscal_year: RequestFiscalYearSummary | null;
  org_unit: RequestOrgUnitSummary | null;
  category: RequestCategorySummary | null;
  program: RequestProgramSummary | null;
  action: RequestActionSummary | null;
  territory?: RequestTerritorySummary | null;
  monthly_summary: RequestPlanningLineMonthlySummary[];
  funding_sources?: RequestAllocationFundingSource[];
  financiers?: RequestAllocationFundingSource[];
}

export interface RequestAllocationFundingSource {
  id: string;
  funding_source_id: string;
  code: string | null;
  name: string | null;
  allocated_amount: number | null;
  percentage: number | null;
}

export interface RequestPlanningLineLookupResponse {
  lines: RequestPlanningLineLookupItem[];
  total: number;
}

export const REQUEST_PLANNING_LINE_SCOPE = {
  DIRECT: "direct",
  HIERARCHY: "hierarchy",
} as const;

export type RequestPlanningLineScope =
  (typeof REQUEST_PLANNING_LINE_SCOPE)[keyof typeof REQUEST_PLANNING_LINE_SCOPE];

export interface RequestPlanningLineLookupOption {
  id: string;
  name: string;
  code?: string | null;
}

export interface RequestPlanningLineSearchItem {
  id: string;
  line_code: string;
  resource_description: string;
  planning_type: string;
  fiscal_year: Pick<RequestFiscalYearSummary, "id" | "year"> | null;
  org_unit: RequestPlanningLineLookupOption | null;
  program: RequestPlanningLineLookupOption | null;
  component: RequestPlanningLineLookupOption | null;
  operative_action: RequestPlanningLineLookupOption | null;
  category: RequestPlanningLineLookupOption | null;
  territory: RequestPlanningLineLookupOption | null;
}

export interface RequestPlanningLineSearchResponse {
  items: RequestPlanningLineSearchItem[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface RequestPlanningLineHydrateResponse {
  items: RequestPlanningLineSearchItem[];
  unavailable_ids: string[];
}

export interface RequestPlanningLineFacetsResponse {
  org_units: RequestPlanningLineLookupOption[];
  planning_types: string[];
  programs: RequestPlanningLineLookupOption[];
  components: RequestPlanningLineLookupOption[];
  operative_actions: RequestPlanningLineLookupOption[];
  categories: RequestPlanningLineLookupOption[];
  territories: RequestPlanningLineLookupOption[];
}

export interface RequestBudgetPreview {
  planning_line: RequestPlanningLineLookupItem;
  month: number | null;
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

export interface RequestAllocationBudgetPreview extends Partial<RequestBudgetPreview> {
  budget_planning_line_id: string;
  amount: number;
  valid: boolean;
  hard_blocked: boolean;
  errors: string[];
  warnings: string[];
}

export interface RequestOrgUnitBudgetGroupPreview {
  org_unit_id: string | null;
  fiscal_year: number;
  requested_amount: number;
}

export interface RequestAllocationsBudgetPreview {
  valid: boolean;
  hard_blocked: boolean;
  total_requested_amount: number;
  fiscal_year: number | null;
  allocation_count: number;
  duplicate_planning_line_ids?: string[];
  errors: string[];
  allocations: RequestAllocationBudgetPreview[];
  org_unit_groups: RequestOrgUnitBudgetGroupPreview[];
}

export interface PaymentRequestPlanningLine {
  id: string;
  line_code?: string | null;
  resource_description?: string | null;
  planning_type?: string | null;
  type_resource?: string | null;
  unit_price?: number | null;
  quantity?: number | null;
  total_cost?: number | null;
  fiscalYear?: RequestFiscalYearSummary | null;
  organizationalUnit?: RequestOrgUnitSummary | null;
  budgetCategory?: RequestCategorySummary | null;
  territory?: RequestTerritorySummary | null;
  program?: RequestProgramSummary | null;
  operativeAction?: RequestActionSummary | null;
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
  metadata?: Readonly<Record<string, unknown>> | null;
  created_at: string;
}

export interface RequestPaymentUserSummary {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export const DRIVE_PAYMENT_ROUTE_MODEL = {
  DAILY_V1: "DAILY_V1",
} as const;

export type KnownDrivePaymentRouteModel =
  (typeof DRIVE_PAYMENT_ROUTE_MODEL)[keyof typeof DRIVE_PAYMENT_ROUTE_MODEL];

export type DrivePaymentRouteModel = KnownDrivePaymentRouteModel;

export interface RequestPayment {
  id: string;
  payment_request_id: string;
  paid_at: string;
  operation_reference: string | null;
  amount_paid: number;
  drive_route_model?: DrivePaymentRouteModel | null;
  drive_routing_date?: string | null;
  drive_route_cutover_at?: string | null;
  readonly drive_route_classified_at?: string | null;
  bank_commission: number | null;
  notes: string | null;
  source_account_key?: DriveSourceAccount | null;
  payment_cycle_kind?: PaymentCycleKind | null;
  payment_cycle_date?: string | null;
  desired_parent_logical_key?: string | null;
  drive_projection_version?: number | null;
  drive_projection_status?: DrivePaymentProjectionStatus | null;
  drive_projection_eligible?: boolean | null;
  drive_projection_attempt_count?: number;
  drive_projection_max_attempts?: number;
  drive_projection_next_attempt_at?: string | null;
  drive_projection_completed_at?: string | null;
  drive_projection_error_code?: string | null;
  drive_projection_error_message?: string | null;
  drive_projection_phase?: string | null;
  drive_projection_reconciliation_required?: boolean;
  drive_projection_frozen?: boolean;
  readonly drive_projection_destination_id?: string | null;
  readonly drive_projection_topology_evidence?: Readonly<Record<string, unknown>> | null;
  proof_document_id: string | null;
  proofDocument?: RequestDocument | null;
  proof_pending?: boolean;
  details_pending?: boolean;
  payment_batch_id?: string | null;
  completed_at?: string | null;
  completed_by_id?: string | null;
  completion_notes?: string | null;
  registered_by_id: string;
  registeredBy?: RequestPaymentUserSummary | null;
  created_at: string;
  updated_at: string;
  allocationExecutions?: RequestAllocationPaymentExecution[];
  proof_entries?: RequestPaymentProof[];
  proofs?: RequestPaymentProof[];
}

export interface RequestPaymentProofAllocation {
  id: string;
  request_payment_proof_id: string;
  request_allocation_id: string;
  amount_covered: number | null;
}

export interface RequestPaymentProof {
  id: string;
  request_payment_id: string;
  proof_document_id: string;
  proof_document?: RequestDocument | null;
  operation_reference: string | null;
  paid_at: string | null;
  amount_paid: number | null;
  notes: string | null;
  metadata?: Record<string, unknown> | null;
  allocations: RequestPaymentProofAllocation[];
  created_at: string;
  updated_at: string;
}

export interface RequestAllocationPaymentExecution {
  id: string;
  request_payment_id: string;
  payment_request_id: string;
  request_allocation_id: string | null;
  budget_planning_line_id: string;
  org_unit_id: string | null;
  fiscal_year: number;
  budget_month: number;
  amount_executed: number;
  currency: RequestCurrency | string;
}

export interface RequestAllocationPlanningLine extends RequestPlanningLineLookupItem {}

export interface RequestAllocation {
  id: string | null;
  payment_request_id: string;
  budget_planning_line_id: string;
  amount: number;
  currency: RequestCurrency | string;
  budget_month: number | null;
  fiscal_year: number;
  org_unit_id: string | null;
  sort_order: number;
  budgetPlanningLine: RequestAllocationPlanningLine | null;
  planning_line: RequestAllocationPlanningLine | null;
  org_unit: RequestOrgUnitSummary | null;
  documents?: RequestDocument[];
  document_checklist?: RequestAllocationDocumentChecklist | null;
  funding_sources?: RequestAllocationFundingSource[];
  financiers?: RequestAllocationFundingSource[];
  payment_execution: RequestAllocationPaymentExecution | null;
}

export interface RequestAllocationRequiredDocumentItem {
  key?: string;
  category?: RequestDocumentCategory | string;
  document_type?: RequestDocumentCategory | string;
  label?: string;
  description?: string;
  required?: boolean;
  satisfied?: boolean;
  acceptedFormatsLabel?: string;
  accepted_formats_label?: string;
  missingMessage?: string;
  missing_message?: string;
}

export interface RequestAllocationDocumentChecklist {
  required_documents?: RequestAllocationRequiredDocumentItem[];
  items?: RequestAllocationRequiredDocumentItem[];
  complete?: boolean;
  missing_messages?: string[];
  missingMessages?: string[];
  is_complete?: boolean;
  isComplete?: boolean;
}

export interface SettlementContextPayment {
  id: string | null;
  paid_at: string | null;
  amount_paid: number | string | null;
  proof_document_id: string | null;
  proof_pending: boolean;
  details_pending: boolean;
  operation_reference: string | null;
  proof_document?: SettlementContextDocument | null;
}

export interface SettlementContextDueDate {
  scheduled_rendition_at: string | null;
  due_date: string | null;
  days_until_due: number | null;
  is_overdue: boolean;
}

export interface SettlementContextRexan {
  outcome: RexanOutcome | null;
  spent_amount: number | string | null;
  balance_amount: number | string | null;
  balance_locked_at: string | null;
  return_proof_document_id: string | null;
  classified_by_id: string | null;
}

export interface SettlementContextOriginalAdvance {
  id: string;
  request_code: string | null;
  sequential_number: string | null;
  requested_amount: number | string | null;
  currency: RequestCurrency;
  concept: string | null;
  requester_id: string | null;
  beneficiary_name: string | null;
  budget_planning_line_id: string | null;
  scheduled_rendition_at: string | null;
  paid_at: string | null;
  disbursed_at: string | null;
  amount_disbursed: number | string | null;
  budgetPlanningLine?: PaymentRequestPlanningLine | null;
  organizationalUnit?: RequestOrgUnitSummary | null;
  allocations?: RequestAllocation[];
}

export interface SettlementContextSettlement {
  id: string;
  request_code: string | null;
  sequential_number: string | null;
  request_type: RequestType;
  status: RequestStatus;
  requested_amount: number | string | null;
  currency: RequestCurrency;
  concept: string | null;
  related_request_id: string | null;
}

export interface SettlementContextDocument extends RequestDocument {
  read_only?: boolean;
}

export interface SettlementContextResponse {
  settlement: SettlementContextSettlement;
  original_advance: SettlementContextOriginalAdvance;
  original_advance_documents: SettlementContextDocument[];
  payment: SettlementContextPayment | null;
  due_date: SettlementContextDueDate | null;
  rexan: SettlementContextRexan | null;
  settlement_documents: RequestDocument[];
}

export interface RelatedRequestSummary {
  id: string;
  request_code: string | null;
  sequential_number: string | null;
  request_type: RequestType;
  status: RequestStatus;
  requested_amount: number;
  currency: RequestCurrency;
  concept: string;
  requester_id: string;
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
  requester_name?: string | null;
  created_by_display_name?: string | null;
  registered_party_name?: string | null;
  registered_party_document_type?: BeneficiaryDocumentType | null;
  registered_party_document_number?: string | null;
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
  drive_folder_url?: string | null;
  drive_folder_name?: string | null;
  drive_sync_status?: DriveSyncStatus | string | null;
  submitted_at: string | null;
  observed_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  paid_at: string | null;
  disbursed_at: string | null;
  amount_disbursed: number | null;
  rexan_outcome?: RexanOutcome | null;
  rexan_spent_amount?: number | string | null;
  rexan_balance_amount?: number | string | null;
  rexan_balance_locked_at?: string | null;
  rexan_return_proof_document_id?: string | null;
  rexan_classified_by_id?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  documents?: RequestDocument[];
  allocations?: RequestAllocation[];
  allocation_count?: number;
  documents_count?: number;
  statusHistory?: RequestStatusHistoryItem[];
  observations?: RequestObservation[];
  payment?: RequestPayment | null;
  rexan_activation?: RexanActivation | null;
  payment_id?: string | null;
  payment_batch_id?: string | null;
  payment_batch_reference?: string | null;
  payment_proof_pending?: boolean;
  payment_details_pending?: boolean;
  proof_pending?: boolean;
  details_pending?: boolean;
  relatedRequest?: RelatedRequestSummary | null;
  advanceSettlements?: RelatedRequestSummary[];
  giof_work?: GiofWorkMetadata;
}

export type StartAdvanceSettlementResponse = PaymentRequest;

export const ADVANCE_SETTLEMENT_CTA_STATE = {
  CAN_START: "can-start",
  CONTINUE_EDITABLE: "continue-editable",
  VIEW_EXISTING: "view-existing",
  RETRY_AFTER_REJECTED: "retry-after-rejected",
  COMPLETED: "completed",
} as const;

export type AdvanceSettlementCtaState =
  (typeof ADVANCE_SETTLEMENT_CTA_STATE)[keyof typeof ADVANCE_SETTLEMENT_CTA_STATE];

export const RENDITION_NEXT_STEP_ACTION = {
  START: "start",
  NAVIGATE: "navigate",
} as const;

export type RenditionNextStepAction =
  (typeof RENDITION_NEXT_STEP_ACTION)[keyof typeof RENDITION_NEXT_STEP_ACTION];

export interface AdvanceSettlementCta {
  state: AdvanceSettlementCtaState;
  label: string;
  description: string;
  href: string | null;
  settlement: RelatedRequestSummary | null;
  canStartNew: boolean;
}

export interface RenditionNextStepGuidance {
  title: string;
  description: string;
  actionLabel: string;
  action: RenditionNextStepAction;
  href: string | null;
}

export interface RequestDocument {
  id: string;
  payment_request_id: string;
  scope_type?: RequestDocumentScopeType | string;
  request_allocation_id?: string | null;
  document_section?: string | null;
  document_category: RequestDocumentCategory | string;
  safe_filename: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number | string;
  sha256_hash?: string | null;
  storage_provider: RequestDocumentStorageProvider | string;
  storage_key?: string | null;
  drive_file_id?: string | null;
  drive_web_url?: string | null;
  upload_status: RequestDocumentUploadStatus | string;
  metadata_json?: Record<string, unknown> | null;
  uploaded_by_id?: string | null;
  created_at: string;
}

export interface RequestReceipt {
  id: string;
  request_id: string;
  request_allocation_id: string | null;
  document_id: string | null;
  receipt_type: RequestReceiptType | string;
  issuer_document_type: string | null;
  issuer_document_number: string | null;
  issuer_name: string | null;
  series: string | null;
  number: string | null;
  issue_date: string | null;
  amount: number | null;
  currency: RequestCurrency | string;
  duplicate_status: RequestReceiptDuplicateStatus | string;
  ocr_status: RequestReceiptOcrStatus | string;
  corrected_fields: Record<string, unknown> | null;
  confirmed_by_id: string | null;
  confirmed_at: string | null;
}

export interface RequestReceiptExtractionSummary {
  id: string;
  provider: string;
  status: RequestReceiptOcrStatus | string;
  confidence: number | null;
  error_message: string | null;
  extracted_fields: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface RequestReceiptDuplicateCandidate {
  receipt_id: string;
  request_id: string;
  document_id: string | null;
  issuer_document_number: string | null;
  series: string | null;
  number: string | null;
  issue_date: string | null;
  amount: number | null;
}

export interface RequestReceiptReview {
  receipt: RequestReceipt;
  latest_extraction: RequestReceiptExtractionSummary | null;
  duplicate_candidates: RequestReceiptDuplicateCandidate[];
}

export interface RequestRenditionAllocationCoverage {
  request_allocation_id: string;
  request_allocation_label?: string;
  planned_amount: number;
  row_total_amount: number;
  paid_base_amount?: number;
  rendered_amount?: number;
  expected_return_amount?: number;
  returned_amount?: number;
  excess_amount?: number;
  line_return?: RequestRenditionLineReturn | null;
  return_validation_status?: LineReturnValidationStatus | string;
  row_count: number;
  has_rows: boolean;
  classification_label?: string | null;
  budget_category_label?: string | null;
  area_label?: string | null;
  org_unit_label?: string | null;
  cost_center_label?: string | null;
  line_code?: string | null;
  line_name?: string | null;
  resource_description?: string | null;
  program_label?: string | null;
  operative_action_label?: string | null;
  importance_label?: string | null;
  frequency_label?: string | null;
  budget_month?: number | null;
  fiscal_year?: number | null;
}

export interface RequestRenditionLineReturn {
  id: string;
  returned_amount: number;
  justification: string;
  return_proof_document_id: string;
  return_proof_filename: string | null;
  status: RequestRenditionLineReturnStatus | string;
  validated_at: string | null;
}

export interface RequestRenditionTotals {
  total_amount: number;
  by_allocation: RequestRenditionAllocationCoverage[];
  missing_allocations: string[];
}

export interface RequestRenditionRow {
  id: string;
  report_id: string;
  request_id: string;
  request_allocation_id: string;
  request_document_id: string;
  request_receipt_id: string | null;
  request_ocr_extraction_id: string | null;
  row_type: RequestRenditionRowType | string;
  purchase_date: string;
  provider_name: string;
  receipt_number: string | null;
  detail: string;
  amount: number;
  currency: RequestCurrency | string;
  review_status: RequestRenditionRowReviewStatus | string;
  source_snapshot: Record<string, unknown> | null;
  classification_label?: string | null;
  budget_category_label?: string | null;
  area_label?: string | null;
  org_unit_label?: string | null;
  cost_center_label?: string | null;
  line_code?: string | null;
  line_name?: string | null;
  resource_description?: string | null;
  program_label?: string | null;
  operative_action_label?: string | null;
  importance_label?: string | null;
  frequency_label?: string | null;
  budget_month?: number | null;
  fiscal_year?: number | null;
  created_at: string;
  updated_at: string;
}

export interface RequestRenditionReport {
  id: string;
  request_id: string;
  status: RequestRenditionReportStatus | string;
  total_amount: number;
  currency: RequestCurrency | string;
  settlement_report_document_id: string | null;
  drive_sync_status: string;
  drive_sync_error: string | null;
  submitted_at: string | null;
  exported_at: string | null;
  updated_at?: string;
  export_pending_state?: RequestRenditionExportPendingState | null;
  can_retry_generation?: boolean;
  export_pending_stale_at?: string | null;
  classification_label?: string | null;
  budget_category_label?: string | null;
  area_label?: string | null;
  org_unit_label?: string | null;
  cost_center_label?: string | null;
  line_code?: string | null;
  line_name?: string | null;
  resource_description?: string | null;
  program_label?: string | null;
  operative_action_label?: string | null;
  importance_label?: string | null;
  frequency_label?: string | null;
  budget_month?: number | null;
  fiscal_year?: number | null;
  rows: RequestRenditionRow[];
  totals: RequestRenditionTotals;
  allocation_coverage: RequestRenditionAllocationCoverage[];
}

export interface RequestRenditionValidationBlocker {
  code: string;
  message: string;
  request_allocation_id?: string;
  request_allocation_label?: string;
  row_id?: string;
  pending_count?: number;
}

export interface RequestRenditionValidationResponse {
  ready: boolean;
  report: RequestRenditionReport;
  totals: RequestRenditionTotals;
  allocation_coverage: RequestRenditionAllocationCoverage[];
  blockers: RequestRenditionValidationBlocker[];
}

export interface RequestRenditionGenerateResponse {
  report: RequestRenditionReport;
  document: RequestDocument;
}

export interface CreateManualRenditionRowInput {
  request_document_id: string;
  request_allocation_id: string;
  purchase_date: string;
  provider_name: string;
  receipt_number?: string | null;
  detail: string;
  amount: number;
}

export interface UpdateRenditionRowInput {
  request_document_id?: string;
  request_allocation_id?: string;
  purchase_date?: string;
  provider_name?: string;
  receipt_number?: string | null;
  detail?: string;
  amount?: number;
}

export interface UpsertRenditionLineReturnInput {
  returned_amount: number;
  justification: string;
  return_proof_document_id: string;
}

export interface UpdateRequestReceiptReviewInput {
  issuer_document_number?: string;
  issuer_name?: string;
  series?: string;
  number?: string;
  issue_date?: string;
  amount?: number;
  currency?: RequestCurrency;
}

export interface RequiredDocumentChecklistItem {
  key: string;
  category: RequestDocumentCategory;
  label: string;
  description: string;
  required: boolean;
  satisfied: boolean;
  acceptedFormatsLabel: string;
  missingMessage: string;
}

export interface ConditionalDocumentChecklistNote {
  key: string;
  label: string;
  description: string;
}

export interface RequiredDocumentChecklist {
  items: RequiredDocumentChecklistItem[];
  conditionalNotes: ConditionalDocumentChecklistNote[];
  missingMessages: string[];
  isComplete: boolean;
}

export interface UploadRequestDocumentInput {
  file: File;
  document_category: RequestDocumentCategory;
  scope_type?: RequestDocumentScopeType;
  request_allocation_id?: string;
  document_section?: string;
  metadata_json?: Record<string, unknown>;
}

export const REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS = {
  PENDING: "pending",
  UPLOADING: "uploading",
  COMPLETED: "completed",
  FAILED: "failed",
  REMOVED: "removed",
} as const;

export type RequestDocumentUploadQueueStatus =
  (typeof REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS)[keyof typeof REQUEST_DOCUMENT_UPLOAD_QUEUE_STATUS];

export const REQUEST_DOCUMENT_UPLOAD_QUEUE_ERROR_KIND = {
  VALIDATION: "validation",
  TRANSIENT: "transient",
  BACKEND: "backend",
} as const;

export type RequestDocumentUploadQueueErrorKind =
  (typeof REQUEST_DOCUMENT_UPLOAD_QUEUE_ERROR_KIND)[keyof typeof REQUEST_DOCUMENT_UPLOAD_QUEUE_ERROR_KIND];

export interface RequestDocumentUploadQueueItem {
  id: string;
  file: File;
  document_category: RequestDocumentCategory;
  scope_type?: RequestDocumentScopeType;
  request_allocation_id?: string;
  status: RequestDocumentUploadQueueStatus;
  error_kind?: RequestDocumentUploadQueueErrorKind;
  error_message?: string;
  retryable: boolean;
}

export interface RequestsListResponse {
  requests: PaymentRequest[];
  total: number;
  page: number;
  limit: number;
}

export interface RequestReviewFilters {
  page?: number;
  limit?: number;
  work_scope?: GiofWorkScope;
  assignee_id?: string;
  request_type?: RequestType;
  status?: RequestStatus;
  submitted_from?: string;
  submitted_to?: string;
  assigned_from?: string;
  assigned_to?: string;
  currency?: RequestCurrency;
  amount_min?: string;
  amount_max?: string;
  org_unit_id?: string;
  search?: string;
}

export interface RequestReviewSummary {
  count: number;
  requested_amount_by_currency: Partial<Record<RequestCurrency, string>>;
  status_counts: Partial<Record<RequestStatus, number>>;
}

export interface RequestReviewResponse extends RequestsListResponse {
  summary: RequestReviewSummary;
}

export interface RequestsListFilters {
  page?: number;
  limit?: number;
  status?: RequestStatus;
  statuses?: RequestStatus[];
  request_type?: RequestType;
  budget_planning_line_id?: string;
  org_unit_id?: string;
  requester_id?: string;
  date_from?: string;
  date_to?: string;
  date_field?: RequestListDateField;
  has_documents?: boolean;
  drive_sync_status?: DriveSyncStatus;
  search?: string;
  scope?: "mine" | "review" | "history";
  work_scope?: GiofWorkScope;
  assignee_id?: string;
}

export interface PaymentQueueFilters {
  page?: number;
  limit?: number;
  status?: typeof REQUEST_STATUS.APPROVED | typeof REQUEST_STATUS.PAID;
  pending_proof?: boolean;
  pending_details?: boolean;
  pending_data?: boolean;
  search?: string;
  work_scope?: GiofWorkScope;
  assignee_id?: string;
  approved_from?: string;
  approved_to?: string;
  paid_from?: string;
  paid_to?: string;
  source_account_key?: DriveSourceAccount;
  completeness?: PaymentCompleteness;
  drive_status?: DrivePaymentProjectionStatus;
  rexan_status?: PaymentQueueRexanStatus;
  currency?: RequestCurrency;
  amount_min?: string;
  amount_max?: string;
  sort?: PaymentQueueSort;
}

export const PAYMENT_COMPLETENESS = {
  COMPLETE: "complete",
  PROOF_MISSING: "proof_missing",
  DETAILS_MISSING: "details_missing",
  SOURCE_MISSING: "source_missing",
  ANY_MISSING: "any_missing",
} as const;

export type PaymentCompleteness =
  (typeof PAYMENT_COMPLETENESS)[keyof typeof PAYMENT_COMPLETENESS];

export const PAYMENT_QUEUE_SORT = {
  QUEUE_DATE_DESC: "queue_date_desc",
  QUEUE_DATE_ASC: "queue_date_asc",
  PAYABLE_AMOUNT_ASC: "payable_amount_asc",
  PAYABLE_AMOUNT_DESC: "payable_amount_desc",
} as const;

export type PaymentQueueSort =
  (typeof PAYMENT_QUEUE_SORT)[keyof typeof PAYMENT_QUEUE_SORT];

export type PaymentQueueRexanStatus =
  (typeof PAYMENT_REXAN_STATUS)[keyof typeof PAYMENT_REXAN_STATUS];

export interface PaymentQueueSummary {
  count: number;
  payable_amount_by_currency: Partial<Record<RequestCurrency, string>>;
  status_counts: Partial<Record<RequestStatus, number>>;
}

export interface PaymentQueueResponse extends RequestsListResponse {
  summary: PaymentQueueSummary;
}

export const BULK_PAYMENT_RESULT_STATUS = {
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
} as const;

export type BulkPaymentResultStatus =
  (typeof BULK_PAYMENT_RESULT_STATUS)[keyof typeof BULK_PAYMENT_RESULT_STATUS];

export const DRIVE_SOURCE_ACCOUNT = {
  BCP_PEN: "BCP_PEN",
  BCP_USD: "BCP_USD",
  BCP_ODF: "BCP_ODF",
  BBVA_PEN: "BBVA_PEN",
  BBVA_USD: "BBVA_USD",
} as const;
export type DriveSourceAccount =
  (typeof DRIVE_SOURCE_ACCOUNT)[keyof typeof DRIVE_SOURCE_ACCOUNT];
export type PaymentCycleKind = "ADVANCE_OR_REIMBURSEMENT" | "SUPPLIER";
export const DRIVE_PAYMENT_PROJECTION_STATUS = {
  SOURCE_REQUIRED: "SOURCE_REQUIRED",
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
} as const;

export type DrivePaymentProjectionStatus =
  (typeof DRIVE_PAYMENT_PROJECTION_STATUS)[keyof typeof DRIVE_PAYMENT_PROJECTION_STATUS];

export const PAYMENT_EMAIL_STATUS = {
  QUEUED: "QUEUED",
  SENT: "SENT",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;

export type PaymentEmailStatus =
  (typeof PAYMENT_EMAIL_STATUS)[keyof typeof PAYMENT_EMAIL_STATUS] | string;

export const PAYMENT_REXAN_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  RETRYING: "RETRYING",
  CREATED: "CREATED",
  REUSED: "REUSED",
  SKIPPED: "SKIPPED",
  FAILED: "FAILED",
} as const;

export type PaymentRexanStatus =
  (typeof PAYMENT_REXAN_STATUS)[keyof typeof PAYMENT_REXAN_STATUS] | string;

export interface BulkMarkPaidInput {
  request_ids: string[];
  giof_items?: BulkPaymentWorkCredential[];
  paid_at: string;
  operation_reference?: string;
  notes?: string;
}

export interface BulkPaymentWorkCredential {
  request_id: string;
  assignment_version: number;
  lease_token: string;
}

export interface BulkPaymentRexanResult {
  job_id?: string | null;
  status: PaymentRexanStatus;
  settlement_request_id?: string | null;
  attempt_count?: number | null;
  next_attempt_at?: string | null;
  error_code?: string | null;
}

export type RexanActivation = BulkPaymentRexanResult;

export interface RegisterPaymentResponse {
  request: PaymentRequest;
  payment_id: string;
  rexan_activation: RexanActivation;
}

export interface BulkPaymentItemResult {
  request_id: string;
  status: BulkPaymentResultStatus | string;
  payment_id?: string | null;
  amount_paid?: number | string | null;
  paid_at?: string | null;
  proof_pending?: boolean;
  details_pending?: boolean;
  email_status?: PaymentEmailStatus | null;
  rexan_activation?: RexanActivation | null;
  error?: string | null;
  source_account_key?: null;
  drive_route_model?: DrivePaymentRouteModel | null;
  drive_routing_date?: string | null;
  drive_route_cutover_at?: string | null;
  readonly drive_route_classified_at?: string | null;
  payment_cycle_kind?: PaymentCycleKind;
  payment_cycle_date?: string;
  desired_parent_logical_key?: null;
  drive_projection_version?: number;
  drive_projection_status?: "SOURCE_REQUIRED";
}

export interface BulkMarkPaidResponse {
  batch_id: string;
  item_count: number;
  success_count: number;
  failed_count: number;
  total_amount: number | string;
  results: BulkPaymentItemResult[];
  rexan_metrics: Record<string, number>;
}

export interface CompletePaymentDetailsInput {
  proof?: File;
  source_account_key?: DriveSourceAccount;
  operation_reference?: string;
  bank_commission?: number;
  notes?: string;
  proof_document_id?: string;
}

export interface AttachPaymentProofInput {
  proof?: File;
  proof_document_id?: string;
  operation_reference?: string;
  paid_at?: string;
  amount_paid?: number;
  notes?: string;
}

export interface RenditionInboxRow extends RenditionDeadlineFields {
  advance_id: string;
  request_code: string | null;
  advance_request_code?: string | null;
  settlement_request_code?: string | null;
  requester: string | null;
  registered_by?: string | null;
  registered_party_name?: string | null;
  registered_party_document_type?: BeneficiaryDocumentType | null;
  registered_party_document_number?: string | null;
  org_unit: string | null;
  concept: string;
  requested_amount: number;
  amount_paid: number | null;
  paid_at: string | null;
  scheduled_rendition_at: string | null;
  rendition_status: RenditionStatus;
  /** @deprecated Use deadline_state and calendar_days_to_deadline. */
  days_overdue: number | null;
  /** @deprecated Use deadline_state and calendar_days_to_deadline. */
  days_until_due: number | null;
  /** @deprecated Use deadline_state and calendar_days_to_deadline. */
  days_remaining: number | null;
  settlement_request_id: string | null;
  settlement_status: RequestStatus | null;
  settlement_updated_at: string | null;
  settlement_submitted_at: string | null;
  settlement_document_count: number;
  settlement_documents_complete: boolean;
  payment_proof_document_id: string | null;
  last_activity_at: string | null;
  giof_work?: GiofWorkMetadata;
}

export interface RenditionInboxCounts extends Record<RenditionStatus, number> {
  due_soon?: number;
}

export interface RenditionStatusFacet {
  excluded_filters: ["status"];
  counts: Record<RenditionStatus, number>;
}

export interface RenditionDeadlineBucketFacet {
  excluded_filters: ["deadline_bucket"];
  counts: Record<RenditionDeadlineBucket, number>;
}

export interface RenditionInboxFacets {
  status: RenditionStatusFacet;
  deadline_bucket: RenditionDeadlineBucketFacet;
}

export interface RenditionInboxSummary {
  count: number;
}

export interface RenditionsInboxResponse {
  renditions: RenditionInboxRow[];
  total: number;
  page: number;
  limit: number;
  counts: RenditionInboxCounts;
  summary: RenditionInboxSummary;
  facets: RenditionInboxFacets;
}

export interface RenditionsInboxFilters {
  page?: number;
  limit?: number;
  status?: RenditionStatus;
  bucket?: RenditionBucket;
  deadline_bucket?: RenditionDeadlineBucket;
  search?: string;
  due_from?: string;
  due_to?: string;
  deadline_from?: string;
  deadline_to?: string;
  sort?: RenditionSortField;
  direction?: RenditionSortDirection;
  work_scope?: GiofWorkScope;
  assignee_id?: string;
}

export interface RegisterPaymentInput {
  paid_at: string;
  source_account_key: DriveSourceAccount;
  operation_reference: string;
  amount_paid: number;
  bank_commission?: number;
  notes?: string;
  proof: File;
}

export interface CreateRequestDto {
  request_type: RequestType;
  budget_planning_line_id?: string;
  requested_amount?: number;
  allocations?: RequestAllocationInputDto[];
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

export interface RequestAllocationInputDto {
  client_key?: string;
  budget_planning_line_id: string;
  amount: number;
}

export interface ObserveRequestDto {
  comment: string;
  field_reference?: string;
}

export interface ApproveRequestDto {
  comment?: string;
  validated_spent_amount?: number;
  return_proof_document_id?: string;
}

export interface RejectRequestDto {
  reason: string;
}

export interface BudgetPreviewInput {
  planningLineId?: string;
  month?: number;
  amount?: number;
  requestId?: string;
  allocations?: RequestAllocationInputDto[];
}
