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
  REQUEST_DOCUMENT_STORAGE_PROVIDER,
  REQUEST_DOCUMENT_UPLOAD_STATUS,
  REQUEST_TYPE,
  ADVANCE_SETTLEMENT_CTA_STATE,
  RENDITION_STATUS,
  RENDITION_SORT_DIRECTION,
  RENDITION_SORT_FIELD,
  type AdvanceSettlementCta,
  type PaymentRequest,
  type RenditionInboxCounts,
  type RenditionInboxRow,
  type RenditionSortDirection,
  type RenditionSortField,
  type RenditionStatus,
  type RequestDocument,
  type RequestDocumentCategory,
  type RequestStatusHistoryItem,
  type AccountType,
  type BankCode,
  type BeneficiaryDocumentType,
  type RequestBudgetPreview,
  type RequiredDocumentChecklist,
  type RequiredDocumentChecklistItem,
  type ConditionalDocumentChecklistNote,
  type RequestStatus,
  type RequestType,
} from "@/types/requests";

export const ACTIVE_REVIEW_STATUSES = [
  REQUEST_STATUS.SUBMITTED,
  REQUEST_STATUS.IN_VALIDATION,
  REQUEST_STATUS.OBSERVED,
] as const;

export const PAYMENT_QUEUE_STATUS = {
  PENDING: REQUEST_STATUS.APPROVED,
  PAID: REQUEST_STATUS.PAID,
} as const;

export const REQUEST_STEPPER_STATE = {
  COMPLETED: "completed",
  CURRENT: "current",
  PENDING: "pending",
} as const;

export type RequestStepperState = (typeof REQUEST_STEPPER_STATE)[keyof typeof REQUEST_STEPPER_STATE];

export const REQUEST_EDIT_STEP = {
  DATA: "data",
  DOCUMENTS: "documents",
  REVIEW: "review",
} as const;

export type RequestEditStep = (typeof REQUEST_EDIT_STEP)[keyof typeof REQUEST_EDIT_STEP];

export interface RequestEditStepperItem {
  step: RequestEditStep;
  label: string;
  state: RequestStepperState;
}

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

export const RENDITION_STATUS_LABELS: Record<RenditionStatus, string> = {
  [RENDITION_STATUS.PENDING]: "Pendiente de rendición",
  [RENDITION_STATUS.OVERDUE]: "Vencida",
  [RENDITION_STATUS.IN_REVIEW]: "En revisión",
  [RENDITION_STATUS.OBSERVED]: "Observada",
  [RENDITION_STATUS.SETTLED]: "Rendida",
};

export const RENDITION_STATUS_FILTER_OPTIONS = [
  { value: RENDITION_STATUS.PENDING, label: "Pendientes" },
  { value: RENDITION_STATUS.OVERDUE, label: "Vencidas" },
  { value: RENDITION_STATUS.IN_REVIEW, label: "En revisión" },
  { value: RENDITION_STATUS.OBSERVED, label: "Observadas" },
  { value: RENDITION_STATUS.SETTLED, label: "Rendidas" },
] as const;

export const RENDITION_SORT_OPTIONS = [
  { value: RENDITION_SORT_FIELD.DUE_DATE, label: "Fecha límite" },
  { value: RENDITION_SORT_FIELD.PAID_AT, label: "Fecha de pago" },
] as const;

export const RENDITION_DIRECTION_OPTIONS = [
  { value: RENDITION_SORT_DIRECTION.ASC, label: "Próximas primero" },
  { value: RENDITION_SORT_DIRECTION.DESC, label: "Más recientes primero" },
] as const;

export interface RenditionSummaryCard {
  key: "pending" | "due-soon" | "overdue" | "in-review" | "observed" | "settled";
  label: string;
  description: string;
  status?: RenditionStatus;
}

export const RENDITION_SUMMARY_CARDS: RenditionSummaryCard[] = [
  { key: "pending", label: "Pendientes de rendición", description: "Anticipos pagados aún sin rendición.", status: RENDITION_STATUS.PENDING },
  { key: "due-soon", label: "Próximas a vencer", description: "Pendientes con fecha límite cercana.", status: RENDITION_STATUS.PENDING },
  { key: "overdue", label: "Vencidas", description: "Anticipos que superaron la fecha límite.", status: RENDITION_STATUS.OVERDUE },
  { key: "in-review", label: "En revisión", description: "Rendiciones enviadas para validación.", status: RENDITION_STATUS.IN_REVIEW },
  { key: "observed", label: "Observadas", description: "Rendiciones devueltas con comentarios.", status: RENDITION_STATUS.OBSERVED },
  { key: "settled", label: "Rendidas", description: "Anticipos cerrados con rendición completa.", status: RENDITION_STATUS.SETTLED },
];

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
  { value: REQUEST_STATUS.IN_VALIDATION, label: "En validación" },
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
  [REQUEST_DOCUMENT_CATEGORY.PXQ]: "PXQ",
  [REQUEST_DOCUMENT_CATEGORY.REQUEST_SUPPORT]: "Sustento de solicitud",
  [REQUEST_DOCUMENT_CATEGORY.RECEIPT]: "Comprobante",
  [REQUEST_DOCUMENT_CATEGORY.CONTRACT]: "Contrato",
  [REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT]: "Informe de rendición",
  [REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF]: "Constancia de pago",
  [REQUEST_DOCUMENT_CATEGORY.OTHER]: "Otro documento",
};

export const REQUEST_DOCUMENT_CATEGORY_OPTIONS = Object.values(REQUEST_DOCUMENT_CATEGORY).map((value) => ({
  value,
  label: REQUEST_DOCUMENT_CATEGORY_LABELS[value],
}));

export const REQUEST_DOCUMENT_ALLOWED_MIME_TYPES = {
  PDF: "application/pdf",
  JPEG: "image/jpeg",
  PNG: "image/png",
  XLS: "application/vnd.ms-excel",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

export const PAYMENT_PROOF_ACCEPT = [REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.PDF, ".pdf"].join(",");

const REQUEST_DOCUMENT_EXCEL_EXTENSIONS = [".xls", ".xlsx"] as const;

export const REQUEST_DOCUMENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const REQUEST_DOCUMENT_ACCEPT = [
  REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.PDF,
  REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.JPEG,
  REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.PNG,
  ".jpg",
  ".jpeg",
  ".png",
  ".pdf",
].join(",");

export const REQUEST_DOCUMENT_EXCEL_ACCEPT = [
  REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.XLS,
  REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.XLSX,
  ...REQUEST_DOCUMENT_EXCEL_EXTENSIONS,
].join(",");

export const REQUEST_DOCUMENT_UPLOAD_SUCCESS_MESSAGE =
  "Documento adjuntado correctamente. El sistema puede enviar una notificación por correo según corresponda.";

export const REQUEST_DOCUMENT_UPLOAD_STATUS_LABELS: Record<string, string> = {
  [REQUEST_DOCUMENT_UPLOAD_STATUS.TEMPORARY]: "Temporal",
  [REQUEST_DOCUMENT_UPLOAD_STATUS.PERMANENT]: "Guardado",
  [REQUEST_DOCUMENT_UPLOAD_STATUS.SYNC_PENDING]: "Sincronización pendiente",
  [REQUEST_DOCUMENT_UPLOAD_STATUS.SYNCED]: "Sincronizado",
  [REQUEST_DOCUMENT_UPLOAD_STATUS.FAILED]: "Con incidencia de almacenamiento",
};

export const REQUEST_DOCUMENT_STORAGE_PROVIDER_LABELS: Record<string, string> = {
  [REQUEST_DOCUMENT_STORAGE_PROVIDER.LOCAL]: "Almacenamiento local",
  [REQUEST_DOCUMENT_STORAGE_PROVIDER.NOOP]: "Almacenamiento simulado",
  [REQUEST_DOCUMENT_STORAGE_PROVIDER.DRIVE]: "Google Drive",
  [REQUEST_DOCUMENT_STORAGE_PROVIDER.AZURE_BLOB]: "Azure Blob Storage",
};

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

export const REQUEST_REVIEW_QUEUE = {
  PENDING_LEVEL_1: "pending-level-1",
  PENDING_LEVEL_2: "pending-level-2",
  OBSERVED_RETURNED: "observed-returned",
  BLOCKED: "blocked",
} as const;

export type RequestReviewQueue = (typeof REQUEST_REVIEW_QUEUE)[keyof typeof REQUEST_REVIEW_QUEUE];

export interface RequestReviewQueueFilter {
  status?: RequestStatus;
  sort: RequestListSort;
  unsupportedReason?: string;
}

export interface RequestReviewQueueCard {
  value: RequestReviewQueue;
  label: string;
  description: string;
}

export const REQUEST_REVIEW_QUEUE_CARDS: RequestReviewQueueCard[] = [
  {
    value: REQUEST_REVIEW_QUEUE.PENDING_LEVEL_1,
    label: "Pendientes Nivel 1",
    description: "Solicitudes enviadas para revisión documental inicial.",
  },
  {
    value: REQUEST_REVIEW_QUEUE.PENDING_LEVEL_2,
    label: "Pendientes Nivel 2",
    description: "Solicitudes en validación o aprobación final.",
  },
  {
    value: REQUEST_REVIEW_QUEUE.OBSERVED_RETURNED,
    label: "Solicitudes devueltas/observadas",
    description: "Solicitudes observadas y devueltas al solicitante.",
  },
  {
    value: REQUEST_REVIEW_QUEUE.BLOCKED,
    label: "Colaboradores bloqueados",
    description: "Funcionalidad en preparación para colaboradores bloqueados.",
  },
];

export function parseRequestListSort(value?: string | null): RequestListSort {
  if (Object.values(REQUEST_LIST_SORT).includes(value as RequestListSort)) {
    return value as RequestListSort;
  }
  return REQUEST_LIST_SORT.NEWEST_FIRST;
}

export function parseRequestStatusFilter(value?: string | null): RequestStatus | undefined {
  if (Object.values(REQUEST_STATUS).includes(value as RequestStatus)) {
    return value as RequestStatus;
  }
  return undefined;
}

export function parseRequestReviewQueue(value?: string | null): RequestReviewQueue | undefined {
  if (Object.values(REQUEST_REVIEW_QUEUE).includes(value as RequestReviewQueue)) {
    return value as RequestReviewQueue;
  }
  return undefined;
}

export function getRequestReviewQueueFilter(queue: RequestReviewQueue): RequestReviewQueueFilter {
  if (queue === REQUEST_REVIEW_QUEUE.PENDING_LEVEL_1) {
    return { status: REQUEST_STATUS.SUBMITTED, sort: REQUEST_LIST_SORT.REVIEW_PRIORITY };
  }
  if (queue === REQUEST_REVIEW_QUEUE.PENDING_LEVEL_2) {
    return { status: REQUEST_STATUS.IN_VALIDATION, sort: REQUEST_LIST_SORT.OLDEST_FIRST };
  }
  if (queue === REQUEST_REVIEW_QUEUE.OBSERVED_RETURNED) {
    return { status: REQUEST_STATUS.OBSERVED, sort: REQUEST_LIST_SORT.NEWEST_FIRST };
  }
  return {
    sort: REQUEST_LIST_SORT.NEWEST_FIRST,
    unsupportedReason: "Funcionalidad en preparación. Esta vista estará disponible cuando se complete la habilitación operativa.",
  };
}

export function getRequestReviewQueueForStatus(status?: RequestStatus): RequestReviewQueue | undefined {
  if (status === REQUEST_STATUS.SUBMITTED) return REQUEST_REVIEW_QUEUE.PENDING_LEVEL_1;
  if (status === REQUEST_STATUS.IN_VALIDATION) return REQUEST_REVIEW_QUEUE.PENDING_LEVEL_2;
  if (status === REQUEST_STATUS.OBSERVED) return REQUEST_REVIEW_QUEUE.OBSERVED_RETURNED;
  return undefined;
}

export function getRequestReviewQueueCount(requests: PaymentRequest[], queue: RequestReviewQueue): number {
  if (queue === REQUEST_REVIEW_QUEUE.BLOCKED) return 0;
  const filter = getRequestReviewQueueFilter(queue);
  return requests.filter((request) => request.status === filter.status).length;
}

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

export function parseRenditionStatusFilter(value?: string | null): RenditionStatus | undefined {
  if (Object.values(RENDITION_STATUS).includes(value as RenditionStatus)) {
    return value as RenditionStatus;
  }
  return undefined;
}

export function parseRenditionSortField(value?: string | null): RenditionSortField {
  if (Object.values(RENDITION_SORT_FIELD).includes(value as RenditionSortField)) {
    return value as RenditionSortField;
  }
  return RENDITION_SORT_FIELD.DUE_DATE;
}

export function parseRenditionSortDirection(value?: string | null): RenditionSortDirection {
  if (Object.values(RENDITION_SORT_DIRECTION).includes(value as RenditionSortDirection)) {
    return value as RenditionSortDirection;
  }
  return RENDITION_SORT_DIRECTION.ASC;
}

export function getRenditionStatusLabel(status: RenditionStatus): string {
  return RENDITION_STATUS_LABELS[status] ?? "Estado no reconocido";
}

export function getRenditionStatusTone(status: RenditionStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === RENDITION_STATUS.OVERDUE) return "destructive";
  if (status === RENDITION_STATUS.SETTLED) return "default";
  if (status === RENDITION_STATUS.IN_REVIEW || status === RENDITION_STATUS.OBSERVED) return "secondary";
  return "outline";
}

function getDateOnlyTime(value?: string | null): number | null {
  if (!value) return null;
  const [datePart] = value.split("T");
  const time = new Date(`${datePart}T00:00:00`).getTime();
  return Number.isNaN(time) ? null : time;
}

export function getRenditionDaysRemaining(row: Pick<RenditionInboxRow, "scheduled_rendition_at" | "days_overdue" | "rendition_status">, today = new Date()): number | null {
  if (typeof row.days_overdue === "number") return -Math.abs(row.days_overdue);
  if (!row.scheduled_rendition_at || row.rendition_status !== RENDITION_STATUS.PENDING) return null;
  const dueTime = getDateOnlyTime(row.scheduled_rendition_at);
  const todayTime = getDateOnlyTime(today.toISOString());
  if (dueTime === null || todayTime === null) return null;
  return Math.ceil((dueTime - todayTime) / (24 * 60 * 60 * 1000));
}

export function getRenditionDueLabel(row: Pick<RenditionInboxRow, "scheduled_rendition_at" | "days_overdue" | "rendition_status">, today = new Date()): string {
  const days = getRenditionDaysRemaining(row, today);
  if (days === null) return "Sin fecha límite";
  if (days < 0) return `${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"} vencida`;
  if (days === 0) return "Vence hoy";
  return `${days} día${days === 1 ? "" : "s"} restante${days === 1 ? "" : "s"}`;
}

export function isRenditionDueSoon(row: Pick<RenditionInboxRow, "scheduled_rendition_at" | "days_overdue" | "rendition_status">, today = new Date()): boolean {
  const days = getRenditionDaysRemaining(row, today);
  return row.rendition_status === RENDITION_STATUS.PENDING && days !== null && days >= 0 && days <= 7;
}

export function getRenditionSummaryCount(card: RenditionSummaryCard, counts: RenditionInboxCounts | null | undefined, rows: RenditionInboxRow[]): number {
  if (card.key === "due-soon") return rows.filter((row) => isRenditionDueSoon(row)).length;
  if (!card.status) return 0;
  return counts?.[card.status] ?? rows.filter((row) => row.rendition_status === card.status).length;
}

export function getRenditionAction(row: Pick<RenditionInboxRow, "advance_id" | "settlement_request_id" | "rendition_status">): { label: string; href: Route } {
  if (row.settlement_request_id) {
    return { label: "Ver REXAN", href: `${ROUTES.REQUESTS}/${row.settlement_request_id}` as Route };
  }
  return { label: row.rendition_status === RENDITION_STATUS.SETTLED ? "Ver anticipo" : "Ver anticipo", href: `${ROUTES.REQUESTS}/${row.advance_id}` as Route };
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
  return "Categoría no reconocida";
}

export function getRequestDocumentUploadStatusLabel(status?: string | null): string {
  if (!status) return "Estado no informado";
  return REQUEST_DOCUMENT_UPLOAD_STATUS_LABELS[status] ?? "Estado no reconocido";
}

export function getRequestDocumentStorageProviderLabel(provider?: string | null): string {
  if (!provider) return "Proveedor no informado";
  return REQUEST_DOCUMENT_STORAGE_PROVIDER_LABELS[provider] ?? "Proveedor no reconocido";
}

export function getRequestDocumentMimeLabel(mimeType?: string | null): string {
  if (mimeType === REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.PDF) return "PDF";
  if (mimeType === REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.JPEG) return "JPEG";
  if (mimeType === REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.PNG) return "PNG";
  if (mimeType === REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.XLS) return "XLS";
  if (mimeType === REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.XLSX) return "XLSX";
  return "Tipo no reconocido";
}

export function getRequestDocumentDisplayName(document: RequestDocument): string {
  return document.original_filename || document.safe_filename || "Documento sin nombre";
}

function isExcelDocumentCategory(category?: RequestDocumentCategory | null): boolean {
  return category === REQUEST_DOCUMENT_CATEGORY.PXQ || category === REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT;
}

function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

function isExcelMimeOrExtension(mimeType?: string | null, filename?: string | null): boolean {
  const normalizedMime = mimeType?.toLowerCase();
  const extension = filename ? getFileExtension(filename) : "";
  return normalizedMime === REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.XLS
    || normalizedMime === REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.XLSX
    || REQUEST_DOCUMENT_EXCEL_EXTENSIONS.includes(extension as (typeof REQUEST_DOCUMENT_EXCEL_EXTENSIONS)[number]);
}

function isBaseDocumentMime(mimeType?: string | null): boolean {
  return mimeType === REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.PDF
    || mimeType === REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.JPEG
    || mimeType === REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.PNG;
}

export function getRequestDocumentAccept(category?: RequestDocumentCategory | null): string {
  return isExcelDocumentCategory(category) ? REQUEST_DOCUMENT_EXCEL_ACCEPT : REQUEST_DOCUMENT_ACCEPT;
}

export function getRequestDocumentAcceptedFormatsLabel(category?: RequestDocumentCategory | null): string {
  return isExcelDocumentCategory(category) ? "XLS o XLSX" : "PDF, JPG o PNG";
}

export function validateRequestDocumentFile(file: File | null, category?: RequestDocumentCategory | null): string | null {
  const formatsLabel = getRequestDocumentAcceptedFormatsLabel(category);
  if (!file) return `Selecciona un archivo ${formatsLabel}.`;
  if (file.size === 0) return "El archivo está vacío. Selecciona un documento válido.";
  if (file.size > REQUEST_DOCUMENT_MAX_FILE_SIZE_BYTES) return "El archivo supera el máximo permitido de 10 MB.";
  if (isExcelDocumentCategory(category)) {
    return isExcelMimeOrExtension(file.type, file.name)
      ? null
      : "Formato no permitido. Adjunta PDF, JPG, PNG, XLS o XLSX según la categoría.";
  }
  const isAllowedBase = isBaseDocumentMime(file.type);
  if (!isAllowedBase) {
    return "Formato no permitido. Adjunta PDF, JPG, PNG, XLS o XLSX según la categoría.";
  }
  return null;
}

export function validatePaymentProofFile(file: File | null): string | null {
  if (!file) return "Adjunta la constancia de pago en PDF.";
  if (file.size === 0) return "La constancia está vacía. Adjunta un PDF válido.";
  if (file.size > REQUEST_DOCUMENT_MAX_FILE_SIZE_BYTES) return "La constancia supera el máximo permitido de 10 MB.";
  const extension = getFileExtension(file.name);
  if (file.type !== REQUEST_DOCUMENT_ALLOWED_MIME_TYPES.PDF && extension !== ".pdf") {
    return "Formato no permitido. Adjunta una constancia en PDF.";
  }
  return null;
}

export function getPaymentQueueStatusLabel(status: RequestStatus): string {
  if (status === REQUEST_STATUS.APPROVED) return "Pendiente de pago";
  if (status === REQUEST_STATUS.PAID) return "Pagado";
  return REQUEST_STATUS_LABELS[status] ?? "Estado no reconocido";
}

export function getPaymentRequestParty(request: PaymentRequest): string {
  if (request.supplier_name?.trim()) return request.supplier_name;
  if (request.beneficiary_name?.trim()) return request.beneficiary_name;
  const requesterName = [request.requester?.firstName, request.requester?.lastName]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
  return requesterName || request.requester?.email || "—";
}

const ADVANCE_SETTLEMENT_EDITABLE_STATUSES = [
  REQUEST_STATUS.DRAFT,
  REQUEST_STATUS.OBSERVED,
] as const;

const ADVANCE_SETTLEMENT_ACTIVE_STATUSES = [
  REQUEST_STATUS.DRAFT,
  REQUEST_STATUS.SUBMITTED,
  REQUEST_STATUS.OBSERVED,
  REQUEST_STATUS.IN_VALIDATION,
] as const;

const ADVANCE_SETTLEMENT_SETTLED_STATUSES = [
  REQUEST_STATUS.APPROVED,
  REQUEST_STATUS.PAID,
  REQUEST_STATUS.CLOSED,
] as const;

export function getRequestDisplayCode(request: Pick<PaymentRequest, "request_code" | "sequential_number" | "id">): string {
  return request.request_code ?? request.sequential_number ?? request.id;
}

export function getActiveAdvanceSettlement(request: Pick<PaymentRequest, "advanceSettlements">): NonNullable<PaymentRequest["advanceSettlements"]>[number] | null {
  return getLatestAdvanceSettlementByStatuses(request, ADVANCE_SETTLEMENT_ACTIVE_STATUSES);
}

function getLatestAdvanceSettlementByStatuses(
  request: Pick<PaymentRequest, "advanceSettlements">,
  statuses: readonly RequestStatus[],
): NonNullable<PaymentRequest["advanceSettlements"]>[number] | null {
  const settlements = request.advanceSettlements?.filter((settlement) => (
    settlement.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT
    && statuses.includes(settlement.status)
  )) ?? [];

  return settlements.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
}

function canAccessAdvanceSettlementCta(
  roleCode: string | null | undefined,
  request: Pick<PaymentRequest, "requester_id">,
  currentUserId?: string | null,
): boolean {
  if (roleCode === ROLE_CODE.ADMIN_SISTEMA || roleCode === ROLE_CODE.GIOF_GESTOR) return true;
  return roleCode === ROLE_CODE.SOLICITANTE_EPE && Boolean(currentUserId) && request.requester_id === currentUserId;
}

function getAdvanceSettlementHref(settlement: NonNullable<PaymentRequest["advanceSettlements"]>[number]): string {
  const baseHref = `${ROUTES.REQUESTS}/${settlement.id}`;
  return ADVANCE_SETTLEMENT_EDITABLE_STATUSES.includes(settlement.status as (typeof ADVANCE_SETTLEMENT_EDITABLE_STATUSES)[number])
    ? `${baseHref}/edit?step=documents`
    : baseHref;
}

export function getAdvanceSettlementCta(
  roleCode: string | null | undefined,
  request: Pick<PaymentRequest, "request_type" | "status" | "requester_id" | "advanceSettlements">,
  currentUserId?: string | null,
): AdvanceSettlementCta | null {
  if (request.request_type !== REQUEST_TYPE.ADVANCE || request.status !== REQUEST_STATUS.PAID) return null;
  if (!canAccessAdvanceSettlementCta(roleCode, request, currentUserId)) return null;

  const activeSettlement = getActiveAdvanceSettlement(request);
  if (activeSettlement) {
    const isEditable = ADVANCE_SETTLEMENT_EDITABLE_STATUSES.includes(activeSettlement.status as (typeof ADVANCE_SETTLEMENT_EDITABLE_STATUSES)[number]);
    return {
      state: isEditable ? ADVANCE_SETTLEMENT_CTA_STATE.CONTINUE_EDITABLE : ADVANCE_SETTLEMENT_CTA_STATE.VIEW_EXISTING,
      label: isEditable ? "Continuar rendición" : "Ver rendición",
      description: isEditable
        ? `Este anticipo ya tiene una rendición editable vinculada (${getRequestDisplayCode(activeSettlement)}). Continúa desde la solicitud existente.`
        : `Este anticipo ya tiene una rendición en revisión vinculada (${getRequestDisplayCode(activeSettlement)}). Puedes revisar la solicitud existente.`,
      href: getAdvanceSettlementHref(activeSettlement),
      settlement: activeSettlement,
      canStartNew: false,
    };
  }

  const settledSettlement = getLatestAdvanceSettlementByStatuses(request, ADVANCE_SETTLEMENT_SETTLED_STATUSES);
  if (settledSettlement) {
    return {
      state: ADVANCE_SETTLEMENT_CTA_STATE.COMPLETED,
      label: "Rendición completada",
      description: `Este anticipo ya fue rendido con la solicitud ${getRequestDisplayCode(settledSettlement)}. No se puede iniciar una nueva rendición.`,
      href: getAdvanceSettlementHref(settledSettlement),
      settlement: settledSettlement,
      canStartNew: false,
    };
  }

  const rejectedSettlement = getLatestAdvanceSettlementByStatuses(request, [REQUEST_STATUS.REJECTED]);
  if (rejectedSettlement) {
    return {
      state: ADVANCE_SETTLEMENT_CTA_STATE.RETRY_AFTER_REJECTED,
      label: "Iniciar nueva rendición",
      description: `La rendición anterior (${getRequestDisplayCode(rejectedSettlement)}) fue rechazada. Puedes iniciar un nuevo intento para este anticipo pagado.`,
      href: null,
      settlement: rejectedSettlement,
      canStartNew: true,
    };
  }

  return {
    state: ADVANCE_SETTLEMENT_CTA_STATE.CAN_START,
    label: "Iniciar rendición",
    description: "Inicia la rendición de este anticipo pagado y adjunta los documentos requeridos.",
    href: null,
    settlement: null,
    canStartNew: true,
  };
}

export function getPaymentRequestRenditionStatus(request: Pick<PaymentRequest, "request_type" | "status" | "scheduled_rendition_at" | "advanceSettlements">): RenditionStatus | null {
  if (request.request_type !== REQUEST_TYPE.ADVANCE || request.status !== REQUEST_STATUS.PAID) return null;

  const settledSettlement = getLatestAdvanceSettlementByStatuses(request, ADVANCE_SETTLEMENT_SETTLED_STATUSES);
  if (settledSettlement) return RENDITION_STATUS.SETTLED;

  const observedSettlement = getLatestAdvanceSettlementByStatuses(request, [REQUEST_STATUS.OBSERVED]);
  if (observedSettlement) return RENDITION_STATUS.OBSERVED;

  const activeSettlement = getLatestAdvanceSettlementByStatuses(request, [REQUEST_STATUS.DRAFT, REQUEST_STATUS.SUBMITTED, REQUEST_STATUS.IN_VALIDATION]);
  if (activeSettlement) return RENDITION_STATUS.IN_REVIEW;

  const dueTime = getDateOnlyTime(request.scheduled_rendition_at);
  const todayTime = getDateOnlyTime(new Date().toISOString());
  if (dueTime !== null && todayTime !== null && dueTime < todayTime) return RENDITION_STATUS.OVERDUE;

  return RENDITION_STATUS.PENDING;
}

export function canStartAdvanceSettlement(
  roleCode: string | null | undefined,
  request: Pick<PaymentRequest, "request_type" | "status" | "requester_id" | "advanceSettlements">,
  currentUserId?: string | null,
): boolean {
  return Boolean(getAdvanceSettlementCta(roleCode, request, currentUserId)?.canStartNew);
}

export function getNewAdvancePendingSettlementBlockMessage(requestType: RequestType, error?: unknown): string | null {
  if (requestType !== REQUEST_TYPE.ADVANCE) return null;
  if (error === undefined || error === null) {
    return "No puedes crear un nuevo anticipo porque tienes dos o más anticipos pagados pendientes de rendición.";
  }
  const backendPendingMessage = error
    ? getApiErrorMessages(error).find((message) => /anticipo|advance/i.test(message) && /pendiente|pending|rendici[oó]n|settlement/i.test(message))
    : undefined;
  return backendPendingMessage ?? null;
}

export function getRequestEditStep(value?: string | null): RequestEditStep {
  if (value === REQUEST_EDIT_STEP.DOCUMENTS || value === REQUEST_EDIT_STEP.REVIEW) return value;
  return REQUEST_EDIT_STEP.DATA;
}

export function getRequestEditStepperItems(activeStep: RequestEditStep): RequestEditStepperItem[] {
  const steps = [REQUEST_EDIT_STEP.DATA, REQUEST_EDIT_STEP.DOCUMENTS, REQUEST_EDIT_STEP.REVIEW] as const;
  const labels: Record<RequestEditStep, string> = {
    [REQUEST_EDIT_STEP.DATA]: "Datos",
    [REQUEST_EDIT_STEP.DOCUMENTS]: "Documentos",
    [REQUEST_EDIT_STEP.REVIEW]: "Revisión/Envío",
  };
  const activeIndex = steps.indexOf(activeStep);

  return steps.map((step, index) => ({
    step,
    label: labels[step],
    state: step === activeStep
      ? REQUEST_STEPPER_STATE.CURRENT
      : index < activeIndex
        ? REQUEST_STEPPER_STATE.COMPLETED
        : REQUEST_STEPPER_STATE.PENDING,
  }));
}

const REQUIRED_DOCUMENT_RULES: Record<RequestType, Omit<RequiredDocumentChecklistItem, "satisfied">[]> = {
  [REQUEST_TYPE.ADVANCE]: [{
    key: "advance-pxq",
    category: REQUEST_DOCUMENT_CATEGORY.PXQ,
    label: "Excel PxQ",
    description: "Adjunta la plantilla PxQ en formato XLS o XLSX.",
    required: true,
    acceptedFormatsLabel: "XLS o XLSX",
    missingMessage: "Falta adjuntar Excel PxQ.",
  }],
  [REQUEST_TYPE.REIMBURSEMENT]: [
    {
      key: "reimbursement-settlement-report",
      category: REQUEST_DOCUMENT_CATEGORY.SETTLEMENT_REPORT,
      label: "Informe de rendición Excel",
      description: "Adjunta el informe de rendición en XLS o XLSX.",
      required: true,
      acceptedFormatsLabel: "XLS o XLSX",
      missingMessage: "Falta adjuntar informe de rendición Excel.",
    },
    {
      key: "reimbursement-receipt",
      category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
      label: "Comprobante",
      description: "Adjunta al menos un comprobante de gasto.",
      required: true,
      acceptedFormatsLabel: "PDF, JPG o PNG",
      missingMessage: "Falta adjuntar comprobante.",
    },
  ],
  [REQUEST_TYPE.SUPPLIER_PAYMENT]: [{
    key: "supplier-receipt",
    category: REQUEST_DOCUMENT_CATEGORY.RECEIPT,
    label: "Comprobante factura/RH",
    description: "Adjunta la factura o recibo por honorarios del proveedor.",
    required: true,
    acceptedFormatsLabel: "PDF, JPG o PNG",
    missingMessage: "Falta adjuntar comprobante factura/RH.",
  }],
  [REQUEST_TYPE.ADVANCE_SETTLEMENT]: [],
};

const SUPPLIER_PAYMENT_CONDITIONAL_NOTES: ConditionalDocumentChecklistNote[] = [
  {
    key: "supplier-rh-support",
    label: "Suspensión RH o sustento aplicable",
    description: "Se solicitará cuando correspondan sustentos por recibo por honorarios, monto UIT u otros datos de la solicitud.",
  },
  {
    key: "supplier-contract-deliverables",
    label: "Contrato y entregables",
    description: "Se solicitará cuando correspondan contrato, entregables u otros sustentos aplicables.",
  },
];

export function getRequiredDocumentChecklist(requestType: RequestType, documents: RequestDocument[]): RequiredDocumentChecklist {
  const rules = REQUIRED_DOCUMENT_RULES[requestType] ?? [];
  const items = rules.map((rule): RequiredDocumentChecklistItem => {
    const matchingDocuments = documents.filter((document) => document.document_category === rule.category);
    const requiresExcel = isExcelDocumentCategory(rule.category);
    const satisfied = matchingDocuments.some((document) => !requiresExcel || isExcelMimeOrExtension(document.mime_type, document.original_filename || document.safe_filename));

    return { ...rule, satisfied };
  });
  const missingMessages = items.filter((item) => item.required && !item.satisfied).map((item) => item.missingMessage);

  return {
    items,
    conditionalNotes: requestType === REQUEST_TYPE.SUPPLIER_PAYMENT ? SUPPLIER_PAYMENT_CONDITIONAL_NOTES : [],
    missingMessages,
    isComplete: missingMessages.length === 0,
  };
}

export function getMissingDocumentMessagesFromError(error: unknown): string[] {
  return getApiErrorMessages(error).filter((message) => /falta adjuntar|documento|required document|missing document/i.test(message));
}

export function getRequestDocumentPermissionMessage(
  roleCode: string | null | undefined,
  status: RequestStatus,
  request: Pick<PaymentRequest, "requester_id">,
  currentUserId?: string | null,
): string | null {
  if (canManageRequestDocuments(roleCode, status, request, currentUserId)) return null;
  if (status !== REQUEST_STATUS.DRAFT && status !== REQUEST_STATUS.OBSERVED) {
    return "Los documentos solo pueden modificarse en borrador u observación. Puedes revisar los adjuntos disponibles.";
  }
  if (roleCode === ROLE_CODE.SOLICITANTE_EPE && request.requester_id !== currentUserId) {
    return "Solo el solicitante titular puede modificar documentos en esta solicitud.";
  }
  return "Tu rol no tiene permisos para cargar o eliminar documentos en este estado.";
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
