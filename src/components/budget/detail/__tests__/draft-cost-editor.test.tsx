import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LineDetailPage } from "../line-detail-page";
import { DraftCostModal } from "../draft-cost-modal";
import { buildDraftCost } from "@/lib/draft-cost";
import { ApiRequestError } from "@/lib/api-client";
import type { PlanningLine } from "@/types/budget";

const state = vi.hoisted(() => ({
  role: "GIOF_GESTOR",
  status: "DRAFT",
  userId: "actor",
  owner: "other",
}));
const mocks = vi.hoisted(() => ({ update: vi.fn(), refetch: vi.fn() }));
const line = {
  id: "line-1",
  fiscal_year_id: "fy",
  organizational_unit_id: "ou",
  program_id: null,
  budget_category_id: "cat",
  planning_type: "PROGRAMA",
  status: "DRAFT",
  resource_description: "Recurso",
  unit_price: 100,
  quantity: 2,
  total_cost: 200,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  created_by: "other",
  monthlyDistribution: [
    {
      id: "m1",
      planning_line_id: "line-1",
      month: 1,
      planned_amount: 200,
      executed_amount: 0,
    },
  ],
} satisfies PlanningLine;
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "line-1" }),
  useRouter: () => ({ back: vi.fn() }),
}));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: () => ({
    user: { id: state.userId, role: { code: state.role } },
  }),
}));
vi.mock("@/hooks/use-budget", () => ({
  usePlanningLine: () => ({
    line: {
      ...line,
      status: state.status as PlanningLine["status"],
      created_by: state.owner,
    },
    isLoading: false,
    error: null,
    refetch: mocks.refetch,
  }),
  useUpdateDraftPlanningLineCost: () => ({
    update: mocks.update,
    isLoading: false,
  }),
}));
vi.mock("../approved-amendment-modal", () => ({
  ApprovedAmendmentModal: () => null,
  ApprovedAmendmentWarnings: () => null,
}));
vi.mock("../monthly-table", () => ({
  MonthlyTable: () => <div>Tabla mensual</div>,
}));
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

describe("DRAFT cost editor", () => {
  beforeEach(() => {
    state.role = "GIOF_GESTOR";
    state.status = "DRAFT";
    state.userId = "actor";
    state.owner = "other";
    mocks.update.mockReset();
    mocks.refetch.mockReset();
    mocks.refetch.mockResolvedValue(undefined);
  });
  it.each(["GIOF_GESTOR", "GIOF_MANAGER", "ADMIN_SISTEMA"])(
    "shows cost edit for %s",
    (role) => {
      state.role = role;
      render(<LineDetailPage />);
      expect(
        screen.getByRole("button", { name: "Editar costo" }),
      ).toBeInTheDocument();
    },
  );
  it("permits only the requester who created the draft", () => {
    state.role = "SOLICITANTE_EPE";
    render(<LineDetailPage />);
    expect(
      screen.queryByRole("button", { name: "Editar costo" }),
    ).not.toBeInTheDocument();
    state.owner = "actor";
    render(<LineDetailPage />);
    expect(
      screen.getByRole("button", { name: "Editar costo" }),
    ).toBeInTheDocument();
  });
  it.each(["AUDITOR_DIRECCION", "PATROCINADOR"])(
    "hides draft PATCH for %s",
    (role) => {
      state.role = role;
      render(<LineDetailPage />);
      expect(
        screen.queryByRole("button", { name: "Editar costo" }),
      ).not.toBeInTheDocument();
    },
  );
  it.each(["SUBMITTED", "APPROVED", "REJECTED"])(
    "hides draft editor for %s",
    (status) => {
      state.status = status;
      render(<LineDetailPage />);
      expect(
        screen.queryByRole("button", { name: "Editar costo" }),
      ).not.toBeInTheDocument();
    },
  );
  it("shows derived total and monthly warning, sends only numeric fields and refreshes detail", async () => {
    mocks.update.mockResolvedValue(line);
    render(<LineDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Editar costo" }));
    expect(
      screen.getByText(/programación mensual puede necesitar ajustes/i),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Precio unitario (S/)"), {
      target: { value: "12.50" },
    });
    fireEvent.change(screen.getByLabelText("Cantidad"), {
      target: { value: "3" },
    });
    expect(screen.getByText(/37[.,]50/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar costo" }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        unit_price: 12.5,
        quantity: 3,
      }),
    );
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalledTimes(1));
  });
  it("keeps dialog and fields after 400/403/409 without claiming success", async () => {
    mocks.update.mockRejectedValue(
      new ApiRequestError(403, {
        message: "secret",
        error: "Forbidden",
        statusCode: 403,
        timestamp: "2026-01-01",
        path: "/budget",
      }),
    );
    render(
      <DraftCostModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar costo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/permiso/i);
    expect(screen.getByLabelText("Precio unitario (S/)")).toHaveValue("100");
  });
  it.each([400, 409])(
    "reports safe %s error and retains entries",
    async (status) => {
      mocks.update.mockRejectedValue(
        new ApiRequestError(status, {
          message: "private backend diagnostics",
          error: "Error",
          statusCode: status,
          timestamp: "2026-01-01",
          path: "/budget",
        }),
      );
      render(
        <DraftCostModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />,
      );
      fireEvent.change(screen.getByLabelText("Cantidad"), {
        target: { value: "4" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Guardar costo" }));
      expect(await screen.findByRole("alert")).not.toHaveTextContent(
        "private backend diagnostics",
      );
      expect(screen.getByLabelText("Cantidad")).toHaveValue("4");
    },
  );
  it("blocks invalid decimals without PATCH", () => {
    render(
      <DraftCostModal line={line} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText("Precio unitario (S/)"), {
      target: { value: "1e3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar costo" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      /máximo dos decimales/i,
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("draft cost validation", () => {
  it.each(["", "-1", "1e2", "0.001", "Infinity", "10000000000", "1,25"])(
    "rejects invalid price %s",
    (price) => {
      expect(buildDraftCost(price, "1").request).toBeNull();
    },
  );
  it("rejects oversized quantity and generated total but accepts zero and decimal quantity", () => {
    expect(buildDraftCost("1", "100000000").request).toBeNull();
    expect(buildDraftCost("9999999999.99", "2").request).toBeNull();
    expect(buildDraftCost("0", "0.5")).toEqual({
      request: { unit_price: 0, quantity: 0.5 },
      total: "0.00",
      errors: {},
    });
  });
});
