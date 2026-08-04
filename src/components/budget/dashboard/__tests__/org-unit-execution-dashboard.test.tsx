import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrgUnitExecutionDashboard } from "../org-unit-execution-dashboard";
import { useOrgUnitExecutionDashboard, useOrgUnitExecutionDashboardOptions } from "@/hooks/use-dashboard";
import { ApiRequestError } from "@/lib/api-client";
import { downloadOrgUnitExecutionReport, saveDownloadedDashboardReport } from "@/lib/dashboard";
import type { OrgUnitExecutionDashboard as OrgUnitExecutionDashboardData, OrgUnitExecutionOptionsResponse } from "@/types/dashboard";
import { toast } from "sonner";

vi.mock("recharts", () => ({
  Bar: () => null,
  BarChart: ({ children }: { children?: ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  CartesianGrid: () => null,
  Legend: () => null,
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

vi.mock("@/hooks/use-dashboard", () => ({
  useOrgUnitExecutionDashboard: vi.fn(),
  useOrgUnitExecutionDashboardOptions: vi.fn(),
}));

vi.mock("@/lib/dashboard", () => ({
  downloadOrgUnitExecutionReport: vi.fn(),
  saveDownloadedDashboardReport: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const dashboardHook = vi.mocked(useOrgUnitExecutionDashboard);
const optionsHook = vi.mocked(useOrgUnitExecutionDashboardOptions);
const downloadReport = vi.mocked(downloadOrgUnitExecutionReport);
const saveDownloadedReport = vi.mocked(saveDownloadedDashboardReport);
const toastSuccess = vi.mocked(toast.success);
const toastError = vi.mocked(toast.error);

const optionsResponse: OrgUnitExecutionOptionsResponse = {
  fiscal_year_id: "fy-1",
  applied_filters: { fiscal_year_id: "fy-1", month_from: 1, month_to: 7, level: "area", parent_id: null },
  options: {
    org_units: [
      { id: "org-1", label: "GIOF", code: "GIOF", parent_id: null },
      { id: "org-2", label: "Dirección", code: "DIR", parent_id: null },
    ],
    programs: [{ id: "program-1", label: "Programa Becas", code: "PB", parent_id: null }],
    components: [{ id: "component-1", label: "Componente Mentoría", code: null, parent_id: "program-1" }],
    operative_actions: [{ id: "action-1", label: "Acción A", code: null, parent_id: "component-1" }],
    resources: [{ id: "line-1", label: "Recurso A", code: "LINE-1", parent_id: "action-1" }],
    funding_sources: [{ id: "source-1", label: "Donación", code: "DON", parent_id: null }],
  },
  warnings: [],
};

const dashboardData: OrgUnitExecutionDashboardData = {
  fiscal_year_id: "fy-1",
  generated_at: "2026-06-18T00:00:00.000Z",
  execution_semantics: "poa_spent_v1",
  applied_filters: { fiscal_year_id: "fy-1", fiscal_year: 2026, selected_month: 7, month_from: 1, month_to: 7, level: "area", parent_id: null },
  current_filters: { fiscal_year_id: "fy-1", fiscal_year: 2026, selected_month: 7, month_from: 1, month_to: 7, level: "area", parent_id: null },
  totals: { programmed: 100, executed: 80, variance: 20, execution_rate: 0.8, currency: "PEN" },
  kpis: {
    annual_programmed: 180,
    period_programmed: 100,
    period_executed: 80,
    period_variance: 20,
    not_executed: 20,
    excedente: 0,
    remaining_programmed: 80,
    execution_rate: 0.8,
    currency: "PEN",
  },
  rows: [{ id: "org-1", code: "GIOF", name: "GIOF", level: "area", parent_id: null, has_children: true, programmed: 100, executed: 80, variance: 20, execution_rate: 0.8, currency: "PEN" }],
  no_ejecutado_rows: [{ id: "org-1", code: "GIOF", name: "GIOF", level: "area", parent_id: null, has_children: true, programmed: 100, executed: 80, variance: 20, execution_rate: 0.8, currency: "PEN", not_executed: 20, excedente: 0 }],
  monthly: [{ month: 7, programmed: 100, executed: 80 }],
  breadcrumbs: [],
  warnings: [{ code: "FUNDING_SOURCE_ALLOCATION_MISSING", message: "Hay líneas con múltiples fuentes sin monto ni porcentaje asignado." }],
};

const dashboardDataForOrgTwo: OrgUnitExecutionDashboardData = {
  ...dashboardData,
  totals: { programmed: 200, executed: 50, variance: 150, execution_rate: 0.25, currency: "PEN" },
  kpis: { ...dashboardData.kpis!, annual_programmed: 260, period_programmed: 200, period_executed: 50, execution_rate: 0.25 },
  rows: [{ id: "org-2", code: "DIR", name: "Dirección", level: "area", parent_id: null, has_children: false, programmed: 200, executed: 50, variance: 150, execution_rate: 0.25, currency: "PEN" }],
  no_ejecutado_rows: [],
  warnings: [],
};

describe("OrgUnitExecutionDashboard", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    downloadReport.mockResolvedValue({ blob: new Blob(["xlsx"]), filename: "programado-ejecutado-backend.xlsx" });
    dashboardHook.mockImplementation((filters) => ({
      data: filters?.org_unit_id === "org-2" ? dashboardDataForOrgTwo : filters ? dashboardData : null,
      isLoading: false,
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    }));
    optionsHook.mockReturnValue({ data: optionsResponse, isLoading: false, isInitialLoading: false, isRefreshing: false, error: null, refetch: vi.fn() });
  });

  it("starts with filters only and does not request dashboard data", () => {
    render(<OrgUnitExecutionDashboard />);

    expect(screen.getByRole("button", { name: "Aplicar filtros" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descargar Excel (fuente + actual)" })).toBeDisabled();
    expect(screen.queryByText("Presupuesto anual")).not.toBeInTheDocument();
    expect(screen.queryByText("Comparación por unidad orgánica")).not.toBeInTheDocument();
    expect(screen.queryByText("Detalle")).not.toBeInTheDocument();
    expect(dashboardHook).toHaveBeenCalledWith(null, { enabled: false });
    expect(dashboardHook).not.toHaveBeenCalledWith(expect.objectContaining({ org_unit_id: expect.any(String) }), expect.anything());
  });

  it("shows validation when applying without Unidad orgánica", async () => {
    const user = userEvent.setup();
    render(<OrgUnitExecutionDashboard />);

    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(screen.getByText("Selecciona una unidad orgánica para cargar el análisis.")).toBeInTheDocument();
    expect(screen.queryByText("Presupuesto anual")).not.toBeInTheDocument();
  });

  it("loads dashboard after applying with Unidad orgánica", async () => {
    const user = userEvent.setup();
    render(<OrgUnitExecutionDashboard />);

    await user.selectOptions(screen.getByLabelText("Unidad orgánica"), "org-1");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(screen.getByText("Presupuesto anual")).toBeInTheDocument();
    expect(screen.getByText(/Presupuesto hasta/i)).toBeInTheDocument();
    expect(screen.getByText("S/ 180.00")).toBeInTheDocument();
    expect(screen.getAllByText("S/ 100.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/80/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Hay líneas con múltiples fuentes sin monto ni porcentaje asignado.")).toBeInTheDocument();
    expect(screen.getByText("Comparación por unidad orgánica")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GIOF" })).toBeInTheDocument();
    expect(screen.getByText("No ejecutado S/ 20.00")).toBeInTheDocument();
    expect(dashboardHook).toHaveBeenLastCalledWith(expect.objectContaining({ org_unit_id: "org-1" }), { enabled: true });
  });

  it("renders all-blank source aggregate KPIs and derived values as no-data instead of zero", async () => {
    const user = userEvent.setup();
    dashboardHook.mockImplementation((filters) => ({
      data: filters ? {
        ...dashboardData,
        semantics_version: "poa-source-months-v1",
        totals: { programmed: null, executed: 0, variance: null, execution_rate: null, currency: "PEN" },
        kpis: {
          annual_programmed: null,
          period_programmed: null,
          period_executed: 0,
          period_variance: null,
          not_executed: null,
          excedente: null,
          remaining_programmed: null,
          execution_rate: null,
          currency: "PEN",
        },
        rows: [{ ...dashboardData.rows[0], programmed: null, executed: 0, variance: null, execution_rate: null }],
        no_ejecutado_rows: [{ ...dashboardData.no_ejecutado_rows![0], programmed: null, executed: 0, variance: null, execution_rate: null, not_executed: null, excedente: null }],
      } : null,
      isLoading: false,
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    }));
    render(<OrgUnitExecutionDashboard />);

    await user.selectOptions(screen.getByLabelText("Unidad orgánica"), "org-1");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(5);
    expect(screen.getAllByText("No aplica").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Sin dato")).toBeInTheDocument();
    expect(screen.queryByText("No ejecutado S/ 0.00")).not.toBeInTheDocument();
  });

  it("shows empty-state copy when no rows are returned after applying", async () => {
    const user = userEvent.setup();
    dashboardHook.mockReturnValue({
      data: { ...dashboardData, rows: [], no_ejecutado_rows: [], warnings: [] },
      isLoading: false,
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<OrgUnitExecutionDashboard />);
    await user.selectOptions(screen.getByLabelText("Unidad orgánica"), "org-1");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(screen.getAllByText("Sin datos para los filtros seleccionados").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Sin diferencias para los filtros seleccionados")).toBeInTheDocument();
  });

  it("clears downstream cascade filters when Unidad orgánica changes", async () => {
    const user = userEvent.setup();
    render(<OrgUnitExecutionDashboard />);

    await user.selectOptions(screen.getByLabelText("Unidad orgánica"), "org-1");
    await user.selectOptions(screen.getByLabelText("Programa"), "program-1");
    expect(screen.getByLabelText<HTMLSelectElement>("Programa").value).toBe("program-1");

    await user.selectOptions(screen.getByLabelText("Unidad orgánica"), "org-2");

    await waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>("Programa").value).toBe(""));
    expect(screen.queryByText("Presupuesto anual")).not.toBeInTheDocument();
  });

  it("keeps displayed results unchanged until pending draft changes are applied", async () => {
    const user = userEvent.setup();
    render(<OrgUnitExecutionDashboard />);

    await user.selectOptions(screen.getByLabelText("Unidad orgánica"), "org-1");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    expect(screen.getByRole("button", { name: "GIOF" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Unidad orgánica"), "org-2");

    expect(screen.getByText(/Tienes cambios sin aplicar/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GIOF" })).toBeInTheDocument();
    expect(screen.queryByText("S/ 260.00")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));

    expect(screen.getByText("S/ 260.00")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "GIOF" })).not.toBeInTheDocument();
  });

  it("downloads Excel with applied filters instead of pending draft filters", async () => {
    const user = userEvent.setup();
    render(<OrgUnitExecutionDashboard />);

    await user.selectOptions(screen.getByLabelText("Unidad orgánica"), "org-1");
    await user.selectOptions(screen.getByLabelText("Programa"), "program-1");
    await user.selectOptions(screen.getByLabelText("Fuente"), "source-1");
    await user.type(screen.getByPlaceholderText("Código, recurso, acción..."), "beca");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await user.selectOptions(screen.getByLabelText("Unidad orgánica"), "org-2");

    await user.click(screen.getByRole("button", { name: "Descargar Excel (fuente + actual)" }));

    expect(downloadReport).toHaveBeenCalledWith(expect.objectContaining({
      fiscal_year: expect.any(Number),
      selected_month: expect.any(Number),
      org_unit_id: "org-1",
      program_id: "program-1",
      funding_source_id: "source-1",
      search: "beca",
      level: "area",
    }));
    expect(downloadReport).not.toHaveBeenCalledWith(expect.objectContaining({ org_unit_id: "org-2" }));
    expect(saveDownloadedReport).toHaveBeenCalledWith(expect.objectContaining({ filename: "programado-ejecutado-backend.xlsx" }), "programado-ejecutado.xlsx");
    expect(toastSuccess).toHaveBeenCalledWith("Excel de Programado vs Ejecutado descargado correctamente.");
  });

  it("shows loading state while exporting", async () => {
    const user = userEvent.setup();
    let resolveDownload: (value: { blob: Blob; filename: string | null }) => void = () => undefined;
    downloadReport.mockReturnValue(new Promise((resolve) => { resolveDownload = resolve; }));
    render(<OrgUnitExecutionDashboard />);

    await user.selectOptions(screen.getByLabelText("Unidad orgánica"), "org-1");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await user.click(screen.getByRole("button", { name: "Descargar Excel (fuente + actual)" }));

    expect(screen.getByRole("button", { name: "Exportando..." })).toBeDisabled();

    resolveDownload({ blob: new Blob(["xlsx"]), filename: null });

    await waitFor(() => expect(screen.getByRole("button", { name: "Descargar Excel (fuente + actual)" })).toBeEnabled());
  });

  it("shows a clear Spanish message if export rejects missing Unidad orgánica", async () => {
    const user = userEvent.setup();
    downloadReport.mockRejectedValue(new ApiRequestError(400, {
      statusCode: 400,
      message: "org_unit_id is required",
      error: "Bad Request",
      timestamp: "2026-06-23T00:00:00.000Z",
      path: "/budget/dashboard/org-unit-execution/export.xlsx",
    }));
    render(<OrgUnitExecutionDashboard />);

    await user.selectOptions(screen.getByLabelText("Unidad orgánica"), "org-1");
    await user.click(screen.getByRole("button", { name: "Aplicar filtros" }));
    await user.click(screen.getByRole("button", { name: "Descargar Excel (fuente + actual)" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Selecciona y aplica una unidad orgánica antes de descargar el Excel."));
  });
});
