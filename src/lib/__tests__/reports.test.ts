import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError, api } from "@/lib/api-client";
import { buildReportsQuery, downloadReport, fetchReport, getReportApiErrorMessage, getReportExportPath, getRequestStatusReportLabel, REPORT_SECTION } from "@/lib/reports";
import { REPORT_DATE_FIELD } from "@/types/reports";
import { REQUEST_STATUS, REQUEST_TYPE } from "@/types/requests";

describe("reports helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("construye query string con filtros válidos y conserva rango de un mismo día", () => {
    const query = buildReportsQuery({
      date_from: "2026-06-13",
      date_to: "2026-06-13",
      date_field: REPORT_DATE_FIELD.PAID_AT,
      fiscal_year: 2026,
      month: 6,
      request_type: REQUEST_TYPE.REIMBURSEMENT,
      status: REQUEST_STATUS.PAID,
      search: "materiales",
      org_unit_id: undefined,
    });

    expect(query).toContain("date_from=2026-06-13");
    expect(query).toContain("date_to=2026-06-13");
    expect(query).toContain("date_field=paid_at");
    expect(query).toContain("request_type=REIMBURSEMENT");
    expect(query).toContain("status=PAID");
    expect(query).toContain("search=materiales");
    expect(query).not.toContain("org_unit_id");
  });

  it("construye ruta de exportación Excel para el reporte activo", () => {
    expect(getReportExportPath(REPORT_SECTION.EXPENSES_BY_CONCEPT, {
      concept_search: "pasajes",
    })).toBe("/reports/expenses-by-concept/export.xlsx?concept_search=pasajes");
  });

  it("muestra etiquetas de negocio para estados", () => {
    expect(getRequestStatusReportLabel(REQUEST_STATUS.APPROVED)).toBe("En gestión de pago");
    expect(getRequestStatusReportLabel("CUSTOM_STATUS")).toBe("CUSTOM_STATUS");
  });

  it("consulta reportes mediante el cliente API autenticado", async () => {
    const getSpy = vi.spyOn(api, "get").mockResolvedValue({ groups: [] });

    await fetchReport(REPORT_SECTION.REQUESTS_BY_STATUS, { status: REQUEST_STATUS.PAID });

    expect(getSpy).toHaveBeenCalledWith("/reports/requests-by-status?status=PAID");
  });

  it("exporta Excel mediante el cliente API autenticado", async () => {
    const downloadSpy = vi.spyOn(api, "download").mockResolvedValue({ blob: new Blob(), filename: "reportes.xlsx" });

    await downloadReport(REPORT_SECTION.REQUESTS_BY_STATUS, { status: REQUEST_STATUS.PAID });

    expect(downloadSpy).toHaveBeenCalledWith("/reports/requests-by-status/export.xlsx?status=PAID");
  });

  it("muestra un mensaje de sesión para errores 401", () => {
    const error = new ApiRequestError(401, {
      error: "Unauthorized",
      message: "Token de acceso no proporcionado",
      path: "/reports/requests-by-status",
      statusCode: 401,
      timestamp: "2026-06-14T00:00:00.000Z",
    });

    expect(getReportApiErrorMessage(error)).toBe("Tu sesión no está disponible. Vuelve a iniciar sesión para consultar reportes.");
  });

  it("muestra mensaje de sesión si el cuerpo del error reporta 401 aunque el estado HTTP venga degradado", () => {
    const error = new ApiRequestError(500, {
      error: "Internal Server Error",
      message: "Token de acceso no proporcionado",
      path: "/reports/requests-by-status",
      statusCode: 401,
      timestamp: "2026-06-14T00:00:00.000Z",
    });

    expect(getReportApiErrorMessage(error)).toBe("Tu sesión no está disponible. Vuelve a iniciar sesión para consultar reportes.");
  });
});
