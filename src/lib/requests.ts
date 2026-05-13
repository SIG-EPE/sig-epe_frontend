import { ApiRequestError } from "@/lib/api-client";
import { ROLE_CODE, ROUTES } from "@/lib/constants";
import type { Route } from "next";
import {
  ACCOUNT_TYPE,
  BANK_CODE,
  BANK_NAME_BY_CODE,
  BENEFICIARY_DOCUMENT_TYPE,
  REQUEST_STATUS,
  REQUEST_DOCUMENT_CATEGORY,
  REQUEST_TYPE,
  type PaymentRequest,
  type RequestDocument,
  type RequestDocumentCategory,
  type RequestStatusHistoryItem,
  type AccountType,
  type BankCode,
  type BeneficiaryDocumentType,
  type RequestBudgetPreview,
  type RequestStatus,
  type RequestType,
} from "@/types/requests";

export const REQUEST_STEPPER_STATE = {
  COMPLETED: "completed",
  CURRENT: "current",
  PENDING: "pending",
} as const;

export type RequestStepperState = (typeof REQUEST_STEPPER_STATE)[keyof typeof REQUEST_STEPPER_STATE];

export interface RequestStatusStepperItem {
  status: RequestStatus;
  label: string;
  state: RequestStepperState;
  date: string | null;
  isBranch: boolean;
}

export interface RequestStatusStepperDates {
  created_at?: string | null;
  submitted_at?: string | null;
  observed_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  paid_at?: string | null;
  closed_at?: string | null;
  voided_at?: string | null;
}

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  [REQUEST_TYPE.ADVANCE]: "Anticipo",
  [REQUEST_TYPE.REIMBURSEMENT]: "Reembolso",
  [REQUEST_TYPE.SUPPLIER_PAYMENT]: "Pago a Proveedor",
  [REQUEST_TYPE.ADVANCE_SETTLEMENT]: "Rendición de anticipo",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  [REQUEST_STATUS.DRAFT]: "Borrador",
  [REQUEST_STATUS.SUBMITTED]: "Enviado",
  [REQUEST_STATUS.OBSERVED]: "Observado",
  [REQUEST_STATUS.IN_VALIDATION]: "En validación",
  [REQUEST_STATUS.APPROVED]: "Aprobado",
  [REQUEST_STATUS.REJECTED]: "Rechazado",
  [REQUEST_STATUS.PAID]: "Pagado",
  [REQUEST_STATUS.CLOSED]: "Cerrado",
  [REQUEST_STATUS.VOIDED]: "Anulado",
};

const REQUEST_STEPPER_LABELS: Record<RequestStatus, string> = {
  [REQUEST_STATUS.DRAFT]: "Borrador",
  [REQUEST_STATUS.SUBMITTED]: "Enviada / En revisión",
  [REQUEST_STATUS.OBSERVED]: "Observada",
  [REQUEST_STATUS.IN_VALIDATION]: "En validación",
  [REQUEST_STATUS.APPROVED]: "Aprobada",
  [REQUEST_STATUS.REJECTED]: "Rechazada",
  [REQUEST_STATUS.PAID]: "Pagada",
  [REQUEST_STATUS.CLOSED]: "Cerrada",
  [REQUEST_STATUS.VOIDED]: "Anulada",
};

const REQUEST_APPROVAL_PATH = [
  REQUEST_STATUS.DRAFT,
  REQUEST_STATUS.SUBMITTED,
  REQUEST_STATUS.APPROVED,
  REQUEST_STATUS.PAID,
  REQUEST_STATUS.CLOSED,
] as const;

const REQUEST_BRANCH_STATUS = {
  OBSERVED: REQUEST_STATUS.OBSERVED,
  REJECTED: REQUEST_STATUS.REJECTED,
  VOIDED: REQUEST_STATUS.VOIDED,
} as const;

export const REQUEST_TYPE_OPTIONS = [
  { value: REQUEST_TYPE.ADVANCE, label: REQUEST_TYPE_LABELS[REQUEST_TYPE.ADVANCE] },
  { value: REQUEST_TYPE.REIMBURSEMENT, label: REQUEST_TYPE_LABELS[REQUEST_TYPE.REIMBURSEMENT] },
  { value: REQUEST_TYPE.SUPPLIER_PAYMENT, label: REQUEST_TYPE_LABELS[REQUEST_TYPE.SUPPLIER_PAYMENT] },
] as const;

export const REQUEST_STATUS_FILTER_OPTIONS = [
  { value: REQUEST_STATUS.DRAFT, label: "Borradores" },
  { value: REQUEST_STATUS.SUBMITTED, label: "Enviadas" },
  { value: REQUEST_STATUS.OBSERVED, label: "Observadas" },
  { value: REQUEST_STATUS.APPROVED, label: "Aprobadas" },
  { value: REQUEST_STATUS.REJECTED, label: "Rechazadas" },
] as const;

export const REQUEST_STATUS_SUMMARY_CARDS = [
  { value: REQUEST_STATUS.DRAFT, label: "Borrador" },
  { value: REQUEST_STATUS.SUBMITTED, label: "Enviadas / Por revisar" },
  { value: REQUEST_STATUS.OBSERVED, label: "Observadas" },
  { value: REQUEST_STATUS.APPROVED, label: "Aprobadas" },
  { value: REQUEST_STATUS.REJECTED, label: "Rechazadas" },
] as const;

export const REQUEST_DOCUMENT_CATEGORY_LABELS: Record<RequestDocumentCategory, string> = {
  [REQUEST_DOCUMENT_CATEGORY.SUPPORT]: "Sustento",
  [REQUEST_DOCUMENT_CATEGORY.RECEIPT]: "Comprobante",
  [REQUEST_DOCUMENT_CATEGORY.QUOTE]: "Cotización",
  [REQUEST_DOCUMENT_CATEGORY.CONTRACT]: "Contrato",
  [REQUEST_DOCUMENT_CATEGORY.OTHER]: "Otro",
};

export const REQUEST_DOCUMENT_CATEGORY_OPTIONS = Object.values(REQUEST_DOCUMENT_CATEGORY).map((value) => ({
  value,
  label: REQUEST_DOCUMENT_CATEGORY_LABELS[value],
}));

export const REQUEST_DOCUMENT_ALLOWED_MIME_TYPES = {
  PDF: "application/pdf",
  JPEG: "image/jpeg",
  PNG: "image/png",
} as const;

export const REQUEST_DOCUMENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const REQUEST_LIST_SORT = {
  REVIEW_PRIORITY: "REVIEW_PRIORITY",
  OLDEST_FIRST: "OLDEST_FIRST",
  NEWEST_FIRST: "NEWEST_FIRST",
} as const;

export type RequestListSort = (typeof REQUEST_LIST_SORT)[keyof typeof REQUEST_LIST_SORT];

export const REQUEST_LIST_SORT_OPTIONS = [
  { value: REQUEST_LIST_SORT.REVIEW_PRIORITY, label: "Prioridad de revisión" },
  { value: REQUEST_LIST_SORT.OLDEST_FIRST, label: "Más antiguas primero" },
  { value: REQUEST_LIST_SORT.NEWEST_FIRST, label: "Más recientes primero" },
] as const;

const REQUEST_LIST_ACTION_KIND = {
  DETAIL: "detail",
  EDIT: "edit",
} as const;

export type RequestListActionKind = (typeof REQUEST_LIST_ACTION_KIND)[keyof typeof REQUEST_LIST_ACTION_KIND];

export interface RequestListAction {
  kind: RequestListActionKind;
  label: string;
  href: Route;
  testId: string;
}

export const BENEFICIARY_DOCUMENT_TYPE_LABELS: Record<BeneficiaryDocumentType, string> = {
  [BENEFICIARY_DOCUMENT_TYPE.DNI]: "DNI",
  [BENEFICIARY_DOCUMENT_TYPE.CE]: "Carné de extranjería",
  [BENEFICIARY_DOCUMENT_TYPE.RUC]: "RUC",
};

export const BENEFICIARY_DOCUMENT_TYPE_OPTIONS = Object.values(BENEFICIARY_DOCUMENT_TYPE).map((value) => ({
  value,
  label: BENEFICIARY_DOCUMENT_TYPE_LABELS[value],
}));

export const BANK_OPTIONS = Object.values(BANK_CODE).map((value) => ({
  value,
  label: BANK_NAME_BY_CODE[value],
}));

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  [ACCOUNT_TYPE.SAVINGS]: "Ahorros",
  [ACCOUNT_TYPE.CHECKING]: "Corriente",
};

export const ACCOUNT_TYPE_OPTIONS = Object.values(ACCOUNT_TYPE).map((value) => ({
  value,
  label: ACCOUNT_TYPE_LABELS[value],
}));

export const MONTH_OPTIONS = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
] as const;

export function formatRequestCurrency(amount: number, currency = "PEN"): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatRequestDate(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(new Date(value));
}

export function formatRequestDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatRequestDocumentSize(value: number | string): string {
  const bytes = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getRequestDocumentCategoryLabel(category: string): string {
  if (Object.values(REQUEST_DOCUMENT_CATEGORY).includes(category as RequestDocumentCategory)) {
    return REQUEST_DOCUMENT_CATEGORY_LABELS[category as RequestDocumentCategory];
  }
  return category;
}

export function getRequestDocumentDisplayName(document: RequestDocument): string {
  return document.original_filename || document.safe_filename || "Documento sin nombre";
}

export function validateRequestDocumentFile(file: File | null): string | null {
  if (!file) return "Selecciona un archivo PDF, JPG o PNG.";
  if (file.size === 0) return "El archivo está vacío. Selecciona un documento válido.";
  if (file.size > REQUEST_DOCUMENT_MAX_FILE_SIZE_BYTES) return "El archivo supera el máximo permitido de 10 MB.";
  if (!Object.values(REQUEST_DOCUMENT_ALLOWED_MIME_TYPES).includes(file.type as (typeof REQUEST_DOCUMENT_ALLOWED_MIME_TYPES)[keyof typeof REQUEST_DOCUMENT_ALLOWED_MIME_TYPES])) {
    return "Formato no permitido. Solo se aceptan PDF, JPG o PNG.";
  }
  return null;
}

function getHistoryDateByStatus(statusHistory: RequestStatusHistoryItem[] | undefined, status: RequestStatus): string | null {
  return statusHistory?.find((item) => item.to_status === status)?.created_at ?? null;
}

function getRequestStepperDate(
  status: RequestStatus,
  statusHistory: RequestStatusHistoryItem[] | undefined,
  dates: RequestStatusStepperDates,
): string | null {
  const historyDate = getHistoryDateByStatus(statusHistory, status);
  if (historyDate) return historyDate;

  if (status === REQUEST_STATUS.DRAFT) return dates.created_at ?? null;
  if (status === REQUEST_STATUS.SUBMITTED) return dates.submitted_at ?? null;
  if (status === REQUEST_STATUS.OBSERVED) return dates.observed_at ?? null;
  if (status === REQUEST_STATUS.APPROVED) return dates.approved_at ?? null;
  if (status === REQUEST_STATUS.REJECTED) return dates.rejected_at ?? null;
  if (status === REQUEST_STATUS.PAID) return dates.paid_at ?? null;
  if (status === REQUEST_STATUS.CLOSED) return dates.closed_at ?? null;
  if (status === REQUEST_STATUS.VOIDED) return dates.voided_at ?? null;
  return null;
}

function hasStepperStatus(statusHistory: RequestStatusHistoryItem[] | undefined, status: RequestStatus): boolean {
  return Boolean(statusHistory?.some((item) => item.to_status === status || item.from_status === status));
}

function getRequestStepperPath(status: RequestStatus, statusHistory?: RequestStatusHistoryItem[]): RequestStatus[] {
  const path: RequestStatus[] = [...REQUEST_APPROVAL_PATH];
  const shouldShowValidation = status === REQUEST_STATUS.IN_VALIDATION || hasStepperStatus(statusHistory, REQUEST_STATUS.IN_VALIDATION);
  if (shouldShowValidation) path.splice(2, 0, REQUEST_STATUS.IN_VALIDATION);

  const branchIndex = path.indexOf(REQUEST_STATUS.SUBMITTED) + 1;
  if (status === REQUEST_BRANCH_STATUS.REJECTED) {
    return [...path.slice(0, branchIndex), REQUEST_STATUS.REJECTED];
  }
  if (status === REQUEST_BRANCH_STATUS.VOIDED) {
    const voidedIndex = hasStepperStatus(statusHistory, REQUEST_STATUS.SUBMITTED) ? branchIndex : 1;
    return [...path.slice(0, voidedIndex), REQUEST_STATUS.VOIDED];
  }

  if (status === REQUEST_BRANCH_STATUS.OBSERVED || hasStepperStatus(statusHistory, REQUEST_BRANCH_STATUS.OBSERVED)) {
    path.splice(branchIndex, 0, REQUEST_STATUS.OBSERVED);
  }

  return path;
}

export function getRequestStatusStepperItems(
  status: RequestStatus,
  statusHistory?: RequestStatusHistoryItem[],
  dates: RequestStatusStepperDates = {},
): RequestStatusStepperItem[] {
  const path = getRequestStepperPath(status, statusHistory);
  const currentIndex = path.indexOf(status);
  const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
  const terminalBranch = status === REQUEST_STATUS.REJECTED || status === REQUEST_STATUS.VOIDED;

  return path.map((stepStatus, index) => {
    const isBranch = stepStatus === REQUEST_STATUS.OBSERVED || stepStatus === REQUEST_STATUS.REJECTED || stepStatus === REQUEST_STATUS.VOIDED;
    const state = stepStatus === status
      ? REQUEST_STEPPER_STATE.CURRENT
      : index < safeCurrentIndex && !(terminalBranch && index > safeCurrentIndex)
        ? REQUEST_STEPPER_STATE.COMPLETED
        : REQUEST_STEPPER_STATE.PENDING;

    return {
      status: stepStatus,
      label: REQUEST_STEPPER_LABELS[stepStatus],
      state,
      date: getRequestStepperDate(stepStatus, statusHistory, dates),
      isBranch,
    };
  });
}

export function getRequestTimelineDate(request: PaymentRequest): string | null {
  return request.submitted_at ?? request.created_at ?? null;
}

function getComparableTime(value?: string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function compareRequestDateAsc(a: PaymentRequest, b: PaymentRequest): number {
  return getComparableTime(getRequestTimelineDate(a)) - getComparableTime(getRequestTimelineDate(b));
}

function compareRequestDateDesc(a: PaymentRequest, b: PaymentRequest): number {
  return compareRequestDateAsc(b, a);
}

export function sortRequestsForList(requests: PaymentRequest[], sort: RequestListSort): PaymentRequest[] {
  return [...requests].sort((a, b) => {
    if (sort === REQUEST_LIST_SORT.NEWEST_FIRST) return compareRequestDateDesc(a, b);
    if (sort === REQUEST_LIST_SORT.OLDEST_FIRST) return compareRequestDateAsc(a, b);

    const aSubmitted = a.status === REQUEST_STATUS.SUBMITTED;
    const bSubmitted = b.status === REQUEST_STATUS.SUBMITTED;
    if (aSubmitted !== bSubmitted) return aSubmitted ? -1 : 1;
    if (aSubmitted && bSubmitted) return compareRequestDateAsc(a, b);
    return compareRequestDateDesc(a, b);
  });
}

export function getRequestMonthLabel(month?: number | null): string {
  return MONTH_OPTIONS.find((option) => option.value === month)?.label ?? "—";
}

export function getApiErrorMessages(error: unknown): string[] {
  if (error instanceof ApiRequestError) {
    const message = error.body.message;
    if (Array.isArray(message)) return message.filter((item): item is string => typeof item === "string");
    if (typeof message === "string") return [message];
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return [error.message];
  }

  return ["Ocurrió un error inesperado. Intenta nuevamente."];
}

export function getApiErrorMessage(error: unknown): string {
  return getApiErrorMessages(error).join("\n");
}

export function isBudgetPreviewBlocking(preview: RequestBudgetPreview | null | undefined): boolean {
  return Boolean(preview?.willExceedOrgUnitCeiling || (preview?.orgUnitBlockingErrors?.length ?? 0) > 0);
}

export function getBeneficiaryDocumentPlaceholder(documentType?: BeneficiaryDocumentType | ""): string {
  if (documentType === BENEFICIARY_DOCUMENT_TYPE.RUC) return "11 dígitos";
  if (documentType === BENEFICIARY_DOCUMENT_TYPE.CE) return "6 a 12 letras o números";
  return "8 dígitos";
}

export function getBeneficiaryDocumentHelp(documentType?: BeneficiaryDocumentType | ""): string {
  if (documentType === BENEFICIARY_DOCUMENT_TYPE.RUC) return "Ingresa el RUC de 11 dígitos.";
  if (documentType === BENEFICIARY_DOCUMENT_TYPE.CE) return "Ingresa el carné de extranjería, de 6 a 12 caracteres alfanuméricos.";
  return "Ingresa el DNI de 8 dígitos.";
}

export function getBeneficiaryDocumentMaxLength(documentType?: BeneficiaryDocumentType | ""): number {
  if (documentType === BENEFICIARY_DOCUMENT_TYPE.RUC) return 11;
  if (documentType === BENEFICIARY_DOCUMENT_TYPE.CE) return 12;
  return 8;
}

export function sanitizeDigits(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

export function sanitizeBeneficiaryDocumentNumber(value: string, documentType?: BeneficiaryDocumentType | ""): string {
  if (documentType === BENEFICIARY_DOCUMENT_TYPE.CE) {
    return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, getBeneficiaryDocumentMaxLength(documentType));
  }

  return sanitizeDigits(value, getBeneficiaryDocumentMaxLength(documentType));
}

export function getBeneficiaryDocumentInputMode(documentType?: BeneficiaryDocumentType | ""): "numeric" | "text" {
  return documentType === BENEFICIARY_DOCUMENT_TYPE.CE ? "text" : "numeric";
}

export function sanitizeBudgetMessage(message: string): string {
  return message.replace(/budget_ceiling/gi, "límite presupuestal");
}

export function isKnownBankCode(value: string): value is BankCode {
  return Object.values(BANK_CODE).includes(value as BankCode);
}

export function getPlanningLineDisplay(line: { line_code?: string | null; resource_description?: string | null } | null | undefined): string {
  if (!line) return "—";
  const code = line.line_code?.trim();
  const description = line.resource_description?.trim();
  if (code && description) return `${code} — ${description}`;
  return code ?? description ?? "—";
}

export function isRequestReviewRole(roleCode?: string | null): boolean {
  return roleCode === ROLE_CODE.GIOF_GESTOR || roleCode === ROLE_CODE.ADMIN_SISTEMA;
}

export function isRequesterRole(roleCode?: string | null): boolean {
  return roleCode === ROLE_CODE.SOLICITANTE_EPE;
}

export function canReviewRequest(roleCode: string | null | undefined, status: RequestStatus): boolean {
  return isRequestReviewRole(roleCode) && status === REQUEST_STATUS.SUBMITTED;
}

export function canCorrectObservedRequest(roleCode: string | null | undefined, status: RequestStatus): boolean {
  return isRequesterRole(roleCode) && status === REQUEST_STATUS.OBSERVED;
}

export function canEditDraftRequest(roleCode: string | null | undefined, status: RequestStatus): boolean {
  return isRequesterRole(roleCode) && status === REQUEST_STATUS.DRAFT;
}

export function canEditRequest(roleCode: string | null | undefined, status: RequestStatus): boolean {
  return canEditDraftRequest(roleCode, status) || canCorrectObservedRequest(roleCode, status);
}

export function canManageRequestDocuments(
  roleCode: string | null | undefined,
  status: RequestStatus,
  request: Pick<PaymentRequest, "requester_id">,
  currentUserId?: string | null,
): boolean {
  const isEditable = status === REQUEST_STATUS.DRAFT || status === REQUEST_STATUS.OBSERVED;
  if (!isEditable) return false;
  if (roleCode === ROLE_CODE.ADMIN_SISTEMA) return true;
  if (roleCode === ROLE_CODE.GIOF_GESTOR) return status === REQUEST_STATUS.OBSERVED;
  return roleCode === ROLE_CODE.SOLICITANTE_EPE && Boolean(currentUserId) && request.requester_id === currentUserId;
}

export function getRequestListActions(roleCode: string | null | undefined, status: RequestStatus, requestId: string): RequestListAction[] {
  const detailHref = `${ROUTES.REQUESTS}/${requestId}` as Route;
  const editHref = `${detailHref}/edit` as Route;

  if (canReviewRequest(roleCode, status)) {
    return [{ kind: REQUEST_LIST_ACTION_KIND.DETAIL, label: "Gestionar", href: detailHref, testId: "request-detail-link" }];
  }

  if (canEditDraftRequest(roleCode, status)) {
    return [
      { kind: REQUEST_LIST_ACTION_KIND.EDIT, label: "Editar", href: editHref, testId: "request-edit-link" },
      { kind: REQUEST_LIST_ACTION_KIND.DETAIL, label: "Ver", href: detailHref, testId: "request-detail-link" },
    ];
  }

  if (canCorrectObservedRequest(roleCode, status)) {
    return [
      { kind: REQUEST_LIST_ACTION_KIND.EDIT, label: "Corregir", href: editHref, testId: "request-edit-link" },
      { kind: REQUEST_LIST_ACTION_KIND.DETAIL, label: "Ver", href: detailHref, testId: "request-detail-link" },
    ];
  }

  return [{ kind: REQUEST_LIST_ACTION_KIND.DETAIL, label: "Ver detalle", href: detailHref, testId: "request-detail-link" }];
}

export function getRequestObserverName(observer: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined): string {
  const name = [observer?.firstName, observer?.lastName].filter((value): value is string => Boolean(value?.trim())).join(" ");
  return name || observer?.email || "Revisor GIOF";
}
