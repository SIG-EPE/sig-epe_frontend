// -------------------------------------------------------
// Dashboard formatters — strict null vs zero semantics
// -------------------------------------------------------

const PEN_FORMAT = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2,
});

const NUMBER_FORMAT = new Intl.NumberFormat("es-PE");

const PERCENT_FORMAT = new Intl.NumberFormat("es-PE", {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function formatMoneyStrict(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return PEN_FORMAT.format(value);
}

export function formatNumberStrict(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Sin dato";
  }

  return NUMBER_FORMAT.format(value);
}

export function formatPercentStrict(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "No aplica";
  }

  return PERCENT_FORMAT.format(value);
}

export function chartNumberOrNull(value: number | null | undefined): number | null {
  return value === null || value === undefined || Number.isNaN(value) ? null : value;
}

export function formatMonthLabel(month: number): string {
  const labels = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ] as const;

  return labels[month - 1] ?? `Mes ${month}`;
}

const BUDGET_DASHBOARD_ALERT_LABELS: Record<string, string> = {
  NO_ALLOCATION: "Sin presupuesto asignado para los filtros seleccionados",
  OVER_EXECUTION: "Sobreejecución presupuestal",
  UNDER_EXECUTION: "Subejecución presupuestal",
};

const REQUEST_STATUS_DASHBOARD_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "En revisión",
  OBSERVED: "Observada",
  IN_VALIDATION: "En validación",
  APPROVED: "Aprobada, pendiente de pago",
  REJECTED: "Rechazada",
  PAID: "Pagada",
  CLOSED: "Cerrada",
  VOIDED: "Anulada",
};

const GIOF_EXCEPTION_LABELS: Record<string, string> = {
  overdue_renditions: "Rendiciones vencidas",
  unassigned_requests: "Solicitudes sin gestor asignado",
  approved_pending_payment: "Aprobadas pendientes de pago",
  observed_requests: "Solicitudes observadas",
};

export function getRequestStatusDashboardLabel(status: string): string {
  return REQUEST_STATUS_DASHBOARD_LABELS[status] ?? status;
}

export function getGiofExceptionLabel(type: string): string {
  return GIOF_EXCEPTION_LABELS[type] ?? type.replaceAll("_", " ");
}

export function getBudgetDashboardAlertMessage(alert: {
  code?: string | null;
  label?: string | null;
  severity?: string | null;
  value?: number | null;
}): string | null {
  const label = alert.label?.trim() || (alert.code ? BUDGET_DASHBOARD_ALERT_LABELS[alert.code] : undefined);

  if (!label) {
    return null;
  }

  if (alert.value === null || alert.value === undefined || Number.isNaN(alert.value)) {
    return label;
  }

  return `${label} (${formatPercentStrict(alert.value)})`;
}

export function truncateChartLabel(label: string, maxLength = 24): string {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
