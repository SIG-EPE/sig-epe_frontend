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

export const RENDITION_STATUS = {
  PENDING: "PENDING",
  OVERDUE: "OVERDUE",
  IN_REVIEW: "IN_REVIEW",
  OBSERVED: "OBSERVED",
  SETTLED: "SETTLED",
} as const;

export type RenditionStatus = (typeof RENDITION_STATUS)[keyof typeof RENDITION_STATUS];

export const RENDITION_SORT_FIELD = {
  DUE_DATE: "due_date",
  PAID_AT: "paid_at",
} as const;

export type RenditionSortField = (typeof RENDITION_SORT_FIELD)[keyof typeof RENDITION_SORT_FIELD];

export const RENDITION_SORT_DIRECTION = {
  ASC: "asc",
  DESC: "desc",
} as const;

export type RenditionSortDirection = (typeof RENDITION_SORT_DIRECTION)[keyof typeof RENDITION_SORT_DIRECTION];

export const REQUEST_CURRENCY = {
  PEN: "PEN",
  USD: "USD",
} as const;

export type RequestCurrency = (typeof REQUEST_CURRENCY)[keyof typeof REQUEST_CURRENCY];

export const REQUEST_DOCUMENT_CATEGORY = {
  PXQ: "PXQ",
  REQUEST_SUPPORT: "REQUEST_SUPPORT",
  RECEIPT: "RECEIPT",
  CONTRACT: "CONTRACT",
  SETTLEMENT_REPORT: "SETTLEMENT_REPORT",
  PAYMENT_PROOF: "PAYMENT_PROOF",
  OTHER: "OTHER",
} as const;

export type RequestDocumentCategory = (typeof REQUEST_DOCUMENT_CATEGORY)[keyof typeof REQUEST_DOCUMENT_CATEGORY];

export const REQUEST_DOCUMENT_STORAGE_PROVIDER = {
  LOCAL: "LOCAL",
  NOOP: "NOOP",
  DRIVE: "DRIVE",
  AZURE_BLOB: "AZURE_BLOB",
} as const;

export type RequestDocumentStorageProvider = (typeof REQUEST_DOCUMENT_STORAGE_PROVIDER)[keyof typeof REQUEST_DOCUMENT_STORAGE_PROVIDER];

export const REQUEST_DOCUMENT_UPLOAD_STATUS = {
  TEMPORARY: "TEMPORARY",
  PERMANENT: "PERMANENT",
  SYNC_PENDING: "SYNC_PENDING",
  SYNCED: "SYNCED",
  FAILED: "FAILED",
} as const;

export type RequestDocumentUploadStatus = (typeof REQUEST_DOCUMENT_UPLOAD_STATUS)[keyof typeof REQUEST_DOCUMENT_UPLOAD_STATUS];

export const REQUEST_RECEIPT_OCR_STATUS = {
  MANUAL: "MANUAL",
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  REQUIRES_REVIEW: "REQUIRES_REVIEW",
} as const;

export type RequestReceiptOcrStatus = (typeof REQUEST_RECEIPT_OCR_STATUS)[keyof typeof REQUEST_RECEIPT_OCR_STATUS];

export const REQUEST_RECEIPT_DUPLICATE_STATUS = {
  UNIQUE: "UNIQUE",
  POSSIBLE_DUPLICATE: "POSSIBLE_DUPLICATE",
  DUPLICATE_CONFIRMED: "DUPLICATE_CONFIRMED",
  IGNORED: "IGNORED",
} as const;

export type RequestReceiptDuplicateStatus = (typeof REQUEST_RECEIPT_DUPLICATE_STATUS)[keyof typeof REQUEST_RECEIPT_DUPLICATE_STATUS];

export const REQUEST_RECEIPT_TYPE = {
  INVOICE: "INVOICE",
  FEE_RECEIPT: "FEE_RECEIPT",
  SALES_RECEIPT: "SALES_RECEIPT",
  TICKET: "TICKET",
  OTHER: "OTHER",
} as const;

export type RequestReceiptType = (typeof REQUEST_RECEIPT_TYPE)[keyof typeof REQUEST_RECEIPT_TYPE];

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

export interface RequestPaymentUserSummary {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export interface RequestPayment {
  id: string;
  payment_request_id: string;
  paid_at: string;
  operation_reference: string;
  amount_paid: number;
  bank_commission: number | null;
  notes: string | null;
  proof_document_id: string;
  proofDocument?: RequestDocument | null;
  registered_by_id: string;
  registeredBy?: RequestPaymentUserSummary | null;
  created_at: string;
  updated_at: string;
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
  payment?: RequestPayment | null;
  relatedRequest?: RelatedRequestSummary | null;
  advanceSettlements?: RelatedRequestSummary[];
}

export type StartAdvanceSettlementResponse = PaymentRequest;

export const ADVANCE_SETTLEMENT_CTA_STATE = {
  CAN_START: "can-start",
  CONTINUE_EDITABLE: "continue-editable",
  VIEW_EXISTING: "view-existing",
  RETRY_AFTER_REJECTED: "retry-after-rejected",
  COMPLETED: "completed",
} as const;

export type AdvanceSettlementCtaState = (typeof ADVANCE_SETTLEMENT_CTA_STATE)[keyof typeof ADVANCE_SETTLEMENT_CTA_STATE];

export interface AdvanceSettlementCta {
  state: AdvanceSettlementCtaState;
  label: string;
  description: string;
  href: string | null;
  settlement: RelatedRequestSummary | null;
  canStartNew: boolean;
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
  statuses?: RequestStatus[];
  request_type?: RequestType;
  budget_planning_line_id?: string;
  org_unit_id?: string;
  search?: string;
}

export interface PaymentQueueFilters {
  page?: number;
  limit?: number;
  status?: typeof REQUEST_STATUS.APPROVED | typeof REQUEST_STATUS.PAID;
  search?: string;
}

export interface RenditionInboxRow {
  advance_id: string;
  request_code: string | null;
  requester: string | null;
  org_unit: string | null;
  concept: string;
  requested_amount: number;
  amount_paid: number | null;
  paid_at: string | null;
  scheduled_rendition_at: string | null;
  rendition_status: RenditionStatus;
  days_overdue: number | null;
  settlement_request_id: string | null;
  settlement_status: RequestStatus | null;
  payment_proof_document_id: string | null;
}

export interface RenditionInboxCounts extends Record<RenditionStatus, number> {}

export interface RenditionsInboxResponse {
  renditions: RenditionInboxRow[];
  total: number;
  page: number;
  limit: number;
  counts: RenditionInboxCounts;
}

export interface RenditionsInboxFilters {
  page?: number;
  limit?: number;
  status?: RenditionStatus;
  search?: string;
  due_from?: string;
  due_to?: string;
  sort?: RenditionSortField;
  direction?: RenditionSortDirection;
}

export interface RegisterPaymentInput {
  paid_at: string;
  operation_reference: string;
  amount_paid: number;
  bank_commission?: number;
  notes?: string;
  proof: File;
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
