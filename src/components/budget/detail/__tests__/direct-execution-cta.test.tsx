import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LineDetailPage } from "../line-detail-page";
import type { PlanningLine } from "@/types/budget";

const state = vi.hoisted(() => ({ role: "GIOF_MANAGER", status: "APPROVED", refetch: vi.fn(), month: null as number | null, refresh: 0 }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "line-1" }), useRouter: () => ({ back: vi.fn() }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: () => ({ user: { id: "user-1", role: { code: state.role } } }) }));
vi.mock("@/hooks/use-budget", () => ({ usePlanningLine: () => ({ line: { id: "line-1", fiscal_year_id: "fy-1", organizational_unit_id: "ou-1", program_id: null, budget_category_id: "cat-1", planning_type: "PROGRAMA", unit_price: 100, quantity: 1, created_by: "user-1", created_at: "2026-01-01", updated_at: "2026-01-01", status: state.status as PlanningLine["status"], resource_description: "Prueba", total_cost: 100, monthlyDistribution: [] } satisfies PlanningLine, isLoading: false, error: null, refetch: state.refetch }) }));
vi.mock("../monthly-table", () => ({ MonthlyTable: ({ onOpenManualExecution, executionRefresh }: { onOpenManualExecution?: (month: number) => void; executionRefresh?: number }) => <div>Meses <button onClick={() => onOpenManualExecution?.(5)}>Acción de mayo</button><span data-testid="refresh">{executionRefresh}</span></div> }));
vi.mock("../manual-execution-modal", () => ({ ManualExecutionModal: ({ initialMonth, onSuccess, onClose }: { initialMonth?: number | null; onSuccess: () => void; onClose: () => void }) => <div role="dialog">Mes inicial: {initialMonth ?? "sin mes"}<button onClick={onSuccess}>Guardar ejecución</button><button onClick={onClose}>Cancelar</button></div> }));
vi.mock("../source-month-grid", () => ({ SourceMonthGrid: () => null }));
vi.mock("../funding-source-distribution", () => ({ FundingSourceDistribution: () => null }));
vi.mock("../status-timeline", () => ({ StatusTimeline: () => null }));
vi.mock("../planning-line-territory-card", () => ({ PlanningLineTerritoryCard: () => null }));
vi.mock("../line-actions", () => ({ LineActions: () => null }));

describe("direct POA execution visibility", () => {
  beforeEach(() => { state.role = "GIOF_MANAGER"; state.status = "APPROVED"; state.refetch.mockReset(); });

  it("opens the one existing modal from the approved manager's header without preselecting a month, then refetches details and totals", async () => {
    const user = userEvent.setup();
    render(<LineDetailPage />);
    await user.click(screen.getByRole("button", { name: "Registrar ejecución directa del POA" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("sin mes");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Guardar ejecución" }));
    expect(state.refetch).toHaveBeenCalledOnce();
    expect(screen.getByTestId("refresh")).toHaveTextContent("1");
  });

  it("preserves the within-month action and preselects the clicked month", async () => {
    const user = userEvent.setup();
    render(<LineDetailPage />);
    await user.click(screen.getByRole("button", { name: "Acción de mayo" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Mes inicial: 5");
  });

  it.each([["ADMIN_SISTEMA", "APPROVED"], ["GIOF_GESTOR", "APPROVED"], ["GIOF_MANAGER", "DRAFT"]])("hides unauthorized header action for %s / %s", (role, status) => {
    state.role = role;
    state.status = status;
    render(<LineDetailPage />);
    expect(screen.queryByRole("button", { name: "Registrar ejecución directa del POA" })).not.toBeInTheDocument();
  });
});
