import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildBudgetExecutionDashboardPath,
  buildGiofOperationsDashboardPath,
  buildOrgUnitExecutionDashboardPath,
  buildOrgUnitExecutionExportPath,
  buildOrgUnitExecutionDashboardOptionsPath,
  downloadOrgUnitExecutionReport,
  getBudgetExecutionDashboard,
  getGiofOperationsDashboard,
  getOrgUnitExecutionDashboard,
  getOrgUnitExecutionDashboardOptions,
} from "@/lib/dashboard";
import { useAuthStore } from "@/stores/auth-store";

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getLastRequestHeaders(): Headers {
  const fetchMock = vi.mocked(fetch);
  const [, init] = fetchMock.mock.calls.at(-1) ?? [];
  return new Headers(init?.headers);
}

describe("dashboard API clients", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    useAuthStore.setState({ user: null, accessToken: "dashboard-token", isLoading: false });
  });

  it("builds budget execution query params without dropping required fiscal year", () => {
    expect(
      buildBudgetExecutionDashboardPath({
        fiscal_year_id: "fy-1",
        org_unit_id: "org-1",
        territory_id: "territory-1",
      }),
    ).toBe("/budget/dashboard/execution?fiscal_year_id=fy-1&org_unit_id=org-1&territory_id=territory-1");
  });

  it("preserves source measure authority in dashboard and report paths", () => {
    expect(
      buildBudgetExecutionDashboardPath({
        fiscal_year_id: "fy-1",
        measure_authority: "source",
      }),
    ).toBe("/budget/dashboard/execution?fiscal_year_id=fy-1&measure_authority=source");

    expect(
      buildOrgUnitExecutionDashboardPath({
        fiscal_year: 2026,
        org_unit_id: "org-1",
        measure_authority: "source",
      }),
    ).toBe("/budget/dashboard/org-unit-execution?fiscal_year=2026&org_unit_id=org-1&measure_authority=source");

    expect(
      buildOrgUnitExecutionExportPath({
        fiscal_year: 2026,
        org_unit_id: "org-1",
        measure_authority: "source",
      }),
    ).toBe("/budget/dashboard/org-unit-execution/export.xlsx?fiscal_year=2026&org_unit_id=org-1&measure_authority=source");
  });

  it("builds GIOF operations query params and omits empty optionals", () => {
    expect(buildGiofOperationsDashboardPath({ date_from: "2026-01-01", fiscal_year: 2026 })).toBe(
      "/dashboard/giof/operations?date_from=2026-01-01&fiscal_year=2026",
    );
  });

  it("builds org unit execution dashboard params", () => {
    expect(buildOrgUnitExecutionDashboardPath({ fiscal_year: 2026, selected_month: 7, program_id: "program-1", funding_source_id: "source-1", search: "beca", top_n: 10, level: "component", parent_id: "org-1" })).toBe(
      "/budget/dashboard/org-unit-execution?fiscal_year=2026&program_id=program-1&funding_source_id=source-1&selected_month=7&level=component&parent_id=org-1&search=beca&top_n=10",
    );
  });

  it("builds org unit execution options params", () => {
    expect(buildOrgUnitExecutionDashboardOptionsPath({ fiscal_year: 2026, org_unit_id: "org-1", component_id: "component-1" })).toBe(
      "/budget/dashboard/org-unit-execution/options?fiscal_year=2026&org_unit_id=org-1&component_id=component-1",
    );
  });

  it("builds org unit execution export params without top_n by default", () => {
    expect(buildOrgUnitExecutionExportPath({ fiscal_year: 2026, selected_month: 7, org_unit_id: "org-1", program_id: "program-1", component_id: "component-1", operative_action_id: "action-1", resource_id: "line-1", funding_source_id: "source-1", level: "resource", parent_id: "action-1", search: "beca", top_n: 10 })).toBe(
      "/budget/dashboard/org-unit-execution/export.xlsx?fiscal_year=2026&org_unit_id=org-1&program_id=program-1&component_id=component-1&operative_action_id=action-1&resource_id=line-1&funding_source_id=source-1&selected_month=7&level=resource&parent_id=action-1&search=beca",
    );
  });

  it("sends auth header to budget dashboard endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({
        data: {
          fiscal_year_id: "fy-1",
          generated_at: "2026-06-14T00:00:00.000Z",
          totals: { allocated: 0, committed: 0, executed: 0, rendered: null, available: 0, execution_rate: null },
          series: [],
          breakdowns: { by_category: [], by_program: [], by_territory: [] },
          alerts: [],
        },
      }),
    );

    await getBudgetExecutionDashboard({ fiscal_year_id: "fy-1" });

    expect(getLastRequestHeaders().get("Authorization")).toBe("Bearer dashboard-token");
  });

  it("sends auth header to GIOF operations endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({
        data: {
          generated_at: "2026-06-14T00:00:00.000Z",
          applied_filters: {},
          summary: { backlog_count: 0, pending_review_count: 0, approved_pending_payment_count: 0, overdue_count: 0, in_risk_count: 0 },
          funnel: [],
          aging: { buckets: [], average_days: null },
          payments: { pending_count: 0, paid_count: 0, pending_amount: 0, paid_amount: 0 },
          renditions: { pending: 0, overdue: 0, in_review: 0, observed: 0, settled: 0 },
          workload_by_manager: [],
          exceptions: [],
        },
      }),
    );

    await getGiofOperationsDashboard({ fiscal_year: 2026 });

    expect(getLastRequestHeaders().get("Authorization")).toBe("Bearer dashboard-token");
  });

  it("sends auth header to org unit execution endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({
        data: {
          fiscal_year_id: "fy-1",
          generated_at: "2026-06-14T00:00:00.000Z",
          execution_semantics: "poa_spent_v1",
          applied_filters: { fiscal_year_id: "fy-1", month_from: 1, month_to: 12, level: "area", parent_id: null },
          totals: { programmed: 0, executed: 0, variance: 0, execution_rate: null, currency: null },
          rows: [],
          monthly: [],
          warnings: [],
        },
      }),
    );

    await getOrgUnitExecutionDashboard({ fiscal_year: 2026 });

    expect(getLastRequestHeaders().get("Authorization")).toBe("Bearer dashboard-token");
  });

  it("downloads org unit execution export through authenticated client", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("xlsx", {
        status: 200,
        headers: { "Content-Disposition": "attachment; filename=programado-ejecutado.xlsx" },
      }),
    );

    const result = await downloadOrgUnitExecutionReport({ fiscal_year: 2026, selected_month: 7, org_unit_id: "org-1", search: "beca", top_n: 10 });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3001/budget/dashboard/org-unit-execution/export.xlsx?fiscal_year=2026&org_unit_id=org-1&selected_month=7&search=beca",
      expect.objectContaining({ credentials: "include", method: "GET" }),
    );
    expect(getLastRequestHeaders().get("Authorization")).toBe("Bearer dashboard-token");
    expect(result.filename).toBe("programado-ejecutado.xlsx");
  });

  it("sends auth header to org unit execution options endpoint", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({
        data: {
          fiscal_year_id: "fy-1",
          applied_filters: { fiscal_year_id: "fy-1", month_from: 1, month_to: 7, level: "area", parent_id: null },
          options: { org_units: [], programs: [], components: [], operative_actions: [], resources: [], funding_sources: [] },
          warnings: [],
        },
      }),
    );

    await getOrgUnitExecutionDashboardOptions({ fiscal_year: 2026, selected_month: 7 });

    expect(getLastRequestHeaders().get("Authorization")).toBe("Bearer dashboard-token");
  });
});
