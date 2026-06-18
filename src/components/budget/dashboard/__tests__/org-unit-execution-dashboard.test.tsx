import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OrgUnitExecutionDashboard } from "../org-unit-execution-dashboard";
import { useOrgUnitExecutionDashboard, useOrgUnitExecutionDashboardOptions } from "@/hooks/use-dashboard";
import type { OrgUnitExecutionDashboard as OrgUnitExecutionDashboardData, OrgUnitExecutionOptionsResponse } from "@/types/dashboard";

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

const dashboardHook = vi.mocked(useOrgUnitExecutionDashboard);
const optionsHook = vi.mocked(useOrgUnitExecutionDashboardOptions);

const optionsResponse: OrgUnitExecutionOptionsResponse = {
  fiscal_year_id: "fy-1",
  applied_filters: { fiscal_year_id: "fy-1", month_from: 1, month_to: 7, level: "area", parent_id: null },
  options: {
    org_units: [{ id: "org-1", label: "GIOF", code: "GIOF", parent_id: null }],
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

describe("OrgUnitExecutionDashboard", () => {
  beforeEach(() => {
    vi.useRealTimers();
    dashboardHook.mockReturnValue({ data: dashboardData, isLoading: false, isInitialLoading: false, isRefreshing: false, error: null, refetch: vi.fn() });
    optionsHook.mockReturnValue({ data: optionsResponse, isLoading: false, isInitialLoading: false, isRefreshing: false, error: null, refetch: vi.fn() });
  });

  it("renders KPI cards, warnings, charts, and detail rows", () => {
    render(<OrgUnitExecutionDashboard />);

    expect(screen.getByText("Presupuesto anual")).toBeInTheDocument();
    expect(screen.getByText(/Presupuesto hasta/i)).toBeInTheDocument();
    expect(screen.getByText("S/ 180.00")).toBeInTheDocument();
    expect(screen.getAllByText("S/ 100.00").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/80/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Hay líneas con múltiples fuentes sin monto ni porcentaje asignado.")).toBeInTheDocument();
    expect(screen.getByText("Comparación por unidad orgánica")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "GIOF" })).toBeInTheDocument();
    expect(screen.getByText("No ejecutado S/ 20.00")).toBeInTheDocument();
  });

  it("shows empty-state copy when no rows are returned", () => {
    dashboardHook.mockReturnValue({
      data: { ...dashboardData, rows: [], no_ejecutado_rows: [], warnings: [] },
      isLoading: false,
      isInitialLoading: false,
      isRefreshing: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<OrgUnitExecutionDashboard />);

    expect(screen.getAllByText("Sin datos para los filtros seleccionados").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Sin diferencias para los filtros seleccionados")).toBeInTheDocument();
  });

  it("clears downstream cascade filters when Unidad orgánica changes", async () => {
    const user = userEvent.setup();
    render(<OrgUnitExecutionDashboard />);

    await user.selectOptions(screen.getByLabelText("Programa"), "program-1");
    expect(screen.getByLabelText<HTMLSelectElement>("Programa").value).toBe("program-1");

    await user.selectOptions(screen.getByLabelText("Unidad orgánica"), "org-1");

    await waitFor(() => expect(screen.getByLabelText<HTMLSelectElement>("Programa").value).toBe(""));
    expect(dashboardHook).toHaveBeenLastCalledWith(expect.objectContaining({ org_unit_id: "org-1", program_id: undefined }));
  });
});
