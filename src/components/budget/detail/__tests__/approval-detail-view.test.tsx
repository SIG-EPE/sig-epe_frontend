import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineDetailPage } from "../line-detail-page";
import type { PlanningLine } from "@/types/budget";

const mocks = vi.hoisted(() => ({
  line: { id: "line-1", resource_description: "Recurso", status: "SUBMITTED", total_cost: 120, unit_price: 120, quantity: 1, monthlyDistribution: [{ id: "month-1", planning_line_id: "line-1", month: 1, planned_amount: 120, executed_amount: 0 }] } as PlanningLine,
  apply: vi.fn(),
  refetch: vi.fn(),
  role: "GIOF_MANAGER",
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "line-1" }), useRouter: () => ({ back: vi.fn() }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: () => ({ user: { id: "manager", role: { code: mocks.role } } }) }));
vi.mock("@/hooks/use-budget", () => ({ usePlanningLine: () => ({ line: mocks.line, isLoading: false, error: null, refetch: mocks.refetch, applyApprovedLine: mocks.apply }) }));
vi.mock("../line-actions", () => ({ LineActions: ({ onApproved, roleCode }: { onApproved: (line: PlanningLine) => void; roleCode?: string }) => <div data-testid="detail-review-role">{roleCode}<button onClick={() => onApproved({ ...mocks.line, status: "APPROVED", approved_at: "2026-09-27T12:00:00Z" })}>Aprobar prueba</button></div> }));
vi.mock("../monthly-table", () => ({ MonthlyTable: ({ lineStatus, entries, editable }: { lineStatus: string; entries: unknown[]; editable: boolean }) => <div data-testid="monthly-state">{lineStatus}:{entries.length}:{editable ? "editable" : "read-only"}</div> }));
vi.mock("../funding-source-distribution", () => ({ FundingSourceDistribution: () => null }));
vi.mock("../status-timeline", () => ({ StatusTimeline: () => null }));
vi.mock("../approved-amendment-modal", () => ({ ApprovedAmendmentWarnings: () => null, ApprovedAmendmentModal: () => null }));

describe("POA detail approval response", () => {
  it("wires committed line to the detail state that drives badge and monthly table", () => {
    mocks.apply.mockClear();
    mocks.refetch.mockClear();
    mocks.role = "GIOF_MANAGER";
    mocks.line = { ...mocks.line, status: "SUBMITTED" };
    const { rerender } = render(<LineDetailPage />);
    expect(screen.getByText("Enviado")).toBeInTheDocument();
    expect(screen.getByTestId("monthly-state")).toHaveTextContent("SUBMITTED:1");
    fireEvent.click(screen.getByRole("button", { name: "Aprobar prueba" }));
    expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({ status: "APPROVED", monthlyDistribution: expect.any(Array) }));
    expect(mocks.refetch).not.toHaveBeenCalled();
    mocks.line = mocks.apply.mock.calls[0][0];
    rerender(<LineDetailPage />);
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
    expect(screen.getByTestId("monthly-state")).toHaveTextContent("APPROVED:1");
  });

  it.each(["GIOF_MANAGER", "ADMIN_SISTEMA", "GIOF_GESTOR", "SOLICITANTE_EPE"])(
    "passes the exact %s role to review controls without removing admin draft editing",
    (role) => {
      mocks.role = role;
      mocks.line = { ...mocks.line, status: "DRAFT" };
      render(<LineDetailPage />);
      expect(screen.getByTestId("detail-review-role")).toHaveTextContent(role);
      if (role === "ADMIN_SISTEMA") {
        expect(screen.getByTestId("monthly-state")).toHaveTextContent("editable");
        expect(screen.getByRole("button", { name: "Editar costo" })).toBeInTheDocument();
      }
    },
  );
});
