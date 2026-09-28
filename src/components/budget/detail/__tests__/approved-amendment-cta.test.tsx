import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LineDetailPage } from "../line-detail-page";
import type { PlanningLine } from "@/types/budget";

const state = vi.hoisted(() => ({ role: "GIOF_MANAGER", status: "APPROVED" }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "line-1" }),
  useRouter: () => ({ back: vi.fn() }),
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: () => ({ user: { id: "manager", role: { code: state.role } } }),
}));
vi.mock("@/hooks/use-budget", () => ({
  usePlanningLine: () => ({
    line: {
      id: "line-1",
      fiscal_year_id: "fy",
      organizational_unit_id: "ou",
      program_id: null,
      budget_category_id: "cat",
      planning_type: "PROGRAMA",
      status: state.status as PlanningLine["status"],
      resource_description: "Recurso",
      unit_price: 100,
      quantity: 1,
      total_cost: 100,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
      created_by: "manager",
      monthlyDistribution: [],
    } satisfies PlanningLine,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("../approved-amendment-modal", () => ({
  ApprovedAmendmentModal: () => null,
  ApprovedAmendmentWarnings: () => null,
}));
vi.mock("../monthly-table", () => ({ MonthlyTable: () => null }));
vi.mock("../manual-execution-modal", () => ({
  ManualExecutionModal: () => null,
}));
vi.mock("../source-month-grid", () => ({ SourceMonthGrid: () => null }));
vi.mock("../funding-source-distribution", () => ({
  FundingSourceDistribution: () => null,
}));
vi.mock("../status-timeline", () => ({ StatusTimeline: () => null }));
vi.mock("../planning-line-territory-card", () => ({
  PlanningLineTerritoryCard: () => null,
}));
vi.mock("../line-actions", () => ({ LineActions: () => null }));

describe("approved POA amendment CTA", () => {
  beforeEach(() => {
    state.role = "GIOF_MANAGER";
    state.status = "APPROVED";
  });
  it("shows manager amendment AND existing manual execution", () => {
    render(<LineDetailPage />);
    expect(
      screen.getByRole("button", { name: "Editar presupuesto aprobado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Registrar ejecución directa del POA",
      }),
    ).toBeInTheDocument();
  });
  it.each(["GIOF_GESTOR", "ADMIN_SISTEMA", "AUDITOR_DIRECCION"])(
    "does not offer amendment to %s",
    (role) => {
      state.role = role;
      render(<LineDetailPage />);
      expect(
        screen.queryByRole("button", { name: "Editar presupuesto aprobado" }),
      ).not.toBeInTheDocument();
    },
  );
  it("does not offer amendment on a draft", () => {
    state.status = "DRAFT";
    render(<LineDetailPage />);
    expect(
      screen.queryByRole("button", { name: "Editar presupuesto aprobado" }),
    ).not.toBeInTheDocument();
  });
});
