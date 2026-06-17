import { describe, expect, it } from "vitest";

import {
  chartNumberOrNull,
  formatMoneyStrict,
  formatNumberStrict,
  formatPercentStrict,
  getBudgetDashboardAlertMessage,
  getGiofExceptionLabel,
  getRequestStatusDashboardLabel,
  truncateChartLabel,
} from "@/lib/dashboard-formatters";

describe("dashboard strict formatters", () => {
  it("shows zero as a real monetary, numeric and percentage value", () => {
    expect(formatMoneyStrict(0)).toBe("S/ 0.00");
    expect(formatNumberStrict(0)).toBe("0");
    expect(formatPercentStrict(0)).toBe("0%");
    expect(chartNumberOrNull(0)).toBe(0);
  });

  it("shows null as absent data and never coerces it to zero", () => {
    expect(formatMoneyStrict(null)).toBe("—");
    expect(formatNumberStrict(null)).toBe("Sin dato");
    expect(formatPercentStrict(null)).toBe("No aplica");
    expect(chartNumberOrNull(null)).toBeNull();
  });

  it("maps technical dashboard keys to business Spanish labels", () => {
    expect(getRequestStatusDashboardLabel("APPROVED")).toBe("Aprobada, pendiente de pago");
    expect(getRequestStatusDashboardLabel("PAID")).toBe("Pagada");
    expect(getGiofExceptionLabel("overdue_renditions")).toBe("Rendiciones vencidas");
    expect(getGiofExceptionLabel("unassigned_requests")).toBe("Solicitudes sin gestor asignado");
  });

  it("maps budget alert codes when the API omits labels", () => {
    expect(getBudgetDashboardAlertMessage({ code: "NO_ALLOCATION", severity: "info" })).toBe(
      "Sin presupuesto asignado para los filtros seleccionados",
    );
    expect(getBudgetDashboardAlertMessage({ code: "UNDER_EXECUTION", severity: "warning", label: "   " })).toBe(
      "Subejecución presupuestal",
    );
  });

  it("returns null for budget alerts that have no displayable message", () => {
    expect(getBudgetDashboardAlertMessage({ code: "UNKNOWN_ALERT", severity: "warning", label: "" })).toBeNull();
  });

  it("truncates long chart labels without changing short labels", () => {
    expect(truncateChartLabel("Programa territorial de fortalecimiento", 16)).toBe("Programa territ…");
    expect(truncateChartLabel("Corto", 16)).toBe("Corto");
  });
});
