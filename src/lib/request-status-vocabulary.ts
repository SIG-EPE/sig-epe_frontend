import {
  RENDITION_STATUS,
  REQUEST_STATUS,
  type RenditionStatus,
  type RequestStatus,
  type RequestType,
  type RexanOutcome,
} from "@/types/requests";

export const REQUEST_STATUS_SURFACE = {
  DETAIL: "detail",
  REVIEW: "review",
  PAYMENT: "payment",
  DASHBOARD: "dashboard",
  LIFECYCLE_FILTER: "lifecycle-filter",
  RENDITION_LIFECYCLE: "rendition-lifecycle",
} as const;

export type RequestStatusSurface =
  (typeof REQUEST_STATUS_SURFACE)[keyof typeof REQUEST_STATUS_SURFACE];

export interface RequestStatusFormatContext {
  surface: RequestStatusSurface;
  requestType?: RequestType | null;
  rexanOutcome?: RexanOutcome | null;
}

const REQUEST_LIFECYCLE_LABELS: Readonly<Record<RequestStatus, string>> = {
  [REQUEST_STATUS.DRAFT]: "Borrador",
  [REQUEST_STATUS.SUBMITTED]: "Enviada a revisión",
  [REQUEST_STATUS.OBSERVED]: "Observada",
  [REQUEST_STATUS.IN_VALIDATION]: "En validación",
  [REQUEST_STATUS.APPROVED]: "Aprobada · pendiente de pago",
  [REQUEST_STATUS.REJECTED]: "Rechazada",
  [REQUEST_STATUS.PAID]: "Pagada",
  [REQUEST_STATUS.CLOSED]: "Cerrada",
  [REQUEST_STATUS.VOIDED]: "Anulada",
};

const REVIEW_STATUS_LABELS: Readonly<Partial<Record<RequestStatus, string>>> = {
  [REQUEST_STATUS.SUBMITTED]: "Por revisar",
  [REQUEST_STATUS.OBSERVED]: "Observada",
};

const PAYMENT_STATUS_LABELS: Readonly<Partial<Record<RequestStatus, string>>> = {
  [REQUEST_STATUS.APPROVED]: "Pendiente de pago",
  [REQUEST_STATUS.PAID]: "Pago registrado",
};

const DASHBOARD_STATUS_LABELS: Readonly<Partial<Record<RequestStatus, string>>> = {
  [REQUEST_STATUS.SUBMITTED]: "Enviadas a revisión",
  [REQUEST_STATUS.APPROVED]: "Aprobadas · pendientes de pago",
  [REQUEST_STATUS.PAID]: "Pagadas",
};

const RENDITION_LIFECYCLE_LABELS: Readonly<Partial<Record<RequestStatus, string>>> = {
  [REQUEST_STATUS.DRAFT]: "En preparación",
  [REQUEST_STATUS.SUBMITTED]: "Enviada a revisión",
  [REQUEST_STATUS.APPROVED]: "Rendición aprobada",
  [REQUEST_STATUS.REJECTED]: "Rendición rechazada",
};

const RENDITION_QUEUE_STATUS_LABELS: Readonly<Record<RenditionStatus, string>> = {
  [RENDITION_STATUS.PENDING]: "Pendiente de rendición",
  [RENDITION_STATUS.OVERDUE]: "Vencida",
  [RENDITION_STATUS.IN_REVIEW]: "En revisión",
  [RENDITION_STATUS.OBSERVED]: "Observada",
  [RENDITION_STATUS.SETTLED]: "Rendida",
};

function getContextualLabel(
  status: RequestStatus,
  surface: RequestStatusSurface,
): string | undefined {
  if (surface === REQUEST_STATUS_SURFACE.REVIEW) return REVIEW_STATUS_LABELS[status];
  if (surface === REQUEST_STATUS_SURFACE.PAYMENT) return PAYMENT_STATUS_LABELS[status];
  if (surface === REQUEST_STATUS_SURFACE.DASHBOARD) return DASHBOARD_STATUS_LABELS[status];
  if (surface === REQUEST_STATUS_SURFACE.RENDITION_LIFECYCLE) {
    return RENDITION_LIFECYCLE_LABELS[status];
  }
  return undefined;
}

export function formatRequestStatus(
  status: string,
  context: RequestStatusFormatContext,
): string {
  const requestStatus = status as RequestStatus;
  return getContextualLabel(requestStatus, context.surface)
    ?? REQUEST_LIFECYCLE_LABELS[requestStatus]
    ?? `Estado no reconocido (${status})`;
}

export function formatRenditionQueueStatus(status: string): string {
  return RENDITION_QUEUE_STATUS_LABELS[status as RenditionStatus]
    ?? `Estado no reconocido (${status})`;
}

export const REQUEST_REVIEW_SELECTOR_STATUSES = [
  REQUEST_STATUS.DRAFT,
  REQUEST_STATUS.SUBMITTED,
  REQUEST_STATUS.OBSERVED,
  REQUEST_STATUS.APPROVED,
  REQUEST_STATUS.REJECTED,
  REQUEST_STATUS.PAID,
] as const satisfies readonly RequestStatus[];

export const REQUEST_PAYMENT_SELECTOR_STATUSES = [
  REQUEST_STATUS.APPROVED,
  REQUEST_STATUS.PAID,
] as const satisfies readonly RequestStatus[];

export const REQUEST_RENDITION_SELECTOR_STATUSES = [
  RENDITION_STATUS.PENDING,
  RENDITION_STATUS.OVERDUE,
  RENDITION_STATUS.IN_REVIEW,
  RENDITION_STATUS.OBSERVED,
  RENDITION_STATUS.SETTLED,
] as const satisfies readonly RenditionStatus[];
