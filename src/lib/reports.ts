import { ApiRequestError, api, type ApiDownloadResult } from "@/lib/api-client";
import { formatBusinessDate } from "@/lib/business-timezone";
import { REQUEST_STATUS, REQUEST_TYPE, type RequestStatus, type RequestType } from "@/types/requests";
import {
  REPORT_DATE_FIELD,
  REPORT_SORT_DIRECTION,
  REPORT_SORT_FIELD,
  type ConceptDetailsFilters,
  type ReportDateField,
  type ReportFilters,
  type ReportSortDirection,
  type ReportSortField,
} from "@/types/reports";

export const REPORT_SECTION = {
  REQUESTS_BY_STATUS: "requests-by-status",
  EXPENSES_BY_REQUEST_TYPE: "expenses-by-request-type",
  EXPENSES_BY_CONCEPT: "expenses-by-concept",
  EXPENSES_BY_CONCEPT_DETAILS: "expenses-by-concept/details",
} as const;

export type ReportSection = (typeof REPORT_SECTION)[keyof typeof REPORT_SECTION];

export const REPORT_DATE_FIELD_OPTIONS: Array<{ value: ReportDateField; label: string }> = [
  { value: REPORT_DATE_FIELD.CREATED_AT, label: "Fecha de creación" },
  { value: REPORT_DATE_FIELD.SUBMITTED_AT, label: "Fecha de envío" },
  { value: REPORT_DATE_FIELD.APPROVED_AT, label: "Fecha de aprobación" },
  { value: REPORT_DATE_FIELD.PAID_AT, label: "Fecha de pago" },
  { value: REPORT_DATE_FIELD.UPDATED_AT, label: "Última actualización" },
  { value: REPORT_DATE_FIELD.PURCHASE_DATE, label: "Fecha del comprobante" },
] as const;

export const REPORT_SORT_OPTIONS: Array<{ value: ReportSortField; label: string }> = [
  { value: REPORT_SORT_FIELD.EXPENSE_DATE, label: "Fecha del gasto" },
  { value: REPORT_SORT_FIELD.AMOUNT, label: "Monto" },
  { value: REPORT_SORT_FIELD.REQUEST_CODE, label: "Código de solicitud" },
  { value: REPORT_SORT_FIELD.CONCEPT, label: "Concepto" },
  { value: REPORT_SORT_FIELD.PROVIDER, label: "Proveedor" },
] as const;

export const REPORT_DIRECTION_OPTIONS: Array<{ value: ReportSortDirection; label: string }> = [
  { value: REPORT_SORT_DIRECTION.DESC, label: "Mayor a menor / recientes primero" },
  { value: REPORT_SORT_DIRECTION.ASC, label: "Menor a mayor / antiguos primero" },
] as const;

export const MONTH_OPTIONS = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
] as const;

export const REQUEST_TYPE_REPORT_OPTIONS: Array<{ value: RequestType; label: string }> = [
  { value: REQUEST_TYPE.ADVANCE, label: "Anticipo" },
  { value: REQUEST_TYPE.REIMBURSEMENT, label: "Reembolso" },
  { value: REQUEST_TYPE.SUPPLIER_PAYMENT, label: "Pago a proveedor" },
  { value: REQUEST_TYPE.ADVANCE_SETTLEMENT, label: "Rendición de anticipo" },
] as const;

export const REQUEST_STATUS_REPORT_OPTIONS: Array<{ value: RequestStatus; label: string }> = [
  { value: REQUEST_STATUS.DRAFT, label: "Borrador" },
  { value: REQUEST_STATUS.SUBMITTED, label: "En revisión" },
  { value: REQUEST_STATUS.OBSERVED, label: "Observada" },
  { value: REQUEST_STATUS.IN_VALIDATION, label: "En validación" },
  { value: REQUEST_STATUS.APPROVED, label: "En gestión de pago" },
  { value: REQUEST_STATUS.REJECTED, label: "Rechazada" },
  { value: REQUEST_STATUS.PAID, label: "Pagada" },
  { value: REQUEST_STATUS.CLOSED, label: "Cerrada" },
  { value: REQUEST_STATUS.VOIDED, label: "Anulada" },
] as const;

export function getReportApiErrorMessage(error: Error): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 401 || error.body.statusCode === 401) return "Tu sesión no está disponible. Vuelve a iniciar sesión para consultar reportes.";
    if (error.status === 403) return "No tienes permisos para consultar reportes.";
    if (error.status === 400) return "Revisa los filtros ingresados e inténtalo nuevamente.";
    return "No se pudo cargar la información solicitada. Inténtalo nuevamente.";
  }

  return error.message || "No se pudo cargar la información solicitada.";
}

export function formatReportCurrency(amount: number, currency = "PEN"): string {
  const code = currency || "PEN";
  return new Intl.NumberFormat("es-PE", {
    currency: code,
    style: "currency",
  }).format(amount);
}

export function formatReportPercent(value: number): string {
  return `${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function getRequestStatusReportLabel(status: string): string {
  return REQUEST_STATUS_REPORT_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function getRequestTypeReportLabel(requestType: string): string {
  return REQUEST_TYPE_REPORT_OPTIONS.find((option) => option.value === requestType)?.label ?? requestType;
}

export function getReportDateLabel(value?: string | null): string {
  return formatBusinessDate(value);
}

export function buildReportsQuery(filters: ReportFilters | ConceptDetailsFilters = {}): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function getReportPath(section: ReportSection, filters?: ReportFilters | ConceptDetailsFilters): string {
  return `/reports/${section}${buildReportsQuery(filters)}`;
}

export function getReportExportPath(section: ReportSection, filters?: ReportFilters): string {
  return `/reports/${section}/export.xlsx${buildReportsQuery(filters)}`;
}

export async function fetchReport<T>(section: ReportSection, filters?: ReportFilters | ConceptDetailsFilters): Promise<T> {
  return api.get<T>(getReportPath(section, filters));
}

export async function downloadReport(section: ReportSection, filters?: ReportFilters): Promise<ApiDownloadResult> {
  return api.download(getReportExportPath(section, filters));
}

export function saveDownloadedReport(download: ApiDownloadResult, fallbackFilename: string): void {
  const filename = download.filename ?? fallbackFilename;
  const url = URL.createObjectURL(download.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
