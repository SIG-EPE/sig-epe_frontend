import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildBudgetExecutionDashboardPath,
  buildGiofOperationsDashboardPath,
  getBudgetExecutionDashboard,
  getGiofOperationsDashboard,
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

  it("builds GIOF operations query params and omits empty optionals", () => {
    expect(buildGiofOperationsDashboardPath({ date_from: "2026-01-01", fiscal_year: 2026 })).toBe(
      "/dashboard/giof/operations?date_from=2026-01-01&fiscal_year=2026",
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
});
