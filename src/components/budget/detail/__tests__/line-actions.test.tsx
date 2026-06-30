import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LineActions } from "@/components/budget/detail/line-actions";
import type { PlanningLine } from "@/hooks/use-budget";
import { PLANNING_TYPE } from "@/lib/planning-types";

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  submit: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

vi.mock("@/components/budget/planning/reject-modal", () => ({
  RejectModal: () => null,
}));

vi.mock("@/hooks/use-budget", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-budget")>();

  return {
    ...actual,
    useApprovePlanningLine: () => ({ approve: mocks.approve, isLoading: false }),
    useSubmitPlanningLine: () => ({ submit: mocks.submit, isLoading: false }),
  };
});

function makePlanningLine(overrides: Partial<PlanningLine> = {}): PlanningLine {
  return {
    id: "line-1",
    fiscal_year_id: "fy-1",
    organizational_unit_id: "ou-1",
    program_id: null,
    budget_category_id: "cat-1",
    planning_type: PLANNING_TYPE.PROGRAMA,
    resource_description: "Recurso test",
    unit_price: 100,
    quantity: 1,
    total_cost: 100,
    status: "SUBMITTED",
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("LineActions", () => {
  beforeEach(() => {
    mocks.approve.mockReset();
    mocks.submit.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it("muestra el mensaje del backend cuando falla la aprobación", async () => {
    const user = userEvent.setup();
    mocks.approve.mockRejectedValue(new Error("No puedes aprobar tu propia línea"));

    render(<LineActions line={makePlanningLine()} isGiof onRefetch={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Aprobar" }));
    await user.click(within(screen.getByRole("dialog", { name: "Confirmar aprobacion" })).getByRole("button", { name: "Aprobar" }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("No puedes aprobar tu propia línea");
    });
  });
});
