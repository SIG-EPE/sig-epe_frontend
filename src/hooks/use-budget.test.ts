import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { api, ApiRequestError } from "@/lib/api-client";
import { invalidateQueryTag } from "@/lib/query-cache";
import {
  PLANNING_LINE_STATE_CONFLICT_CODE,
  isPlanningLineStateConflict,
  recoverFromPlanningLineStateConflict,
  useMonthlyDistribution,
} from "@/hooks/use-budget";

vi.mock("@/lib/api-client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    api: { ...actual.api, get: vi.fn() },
  };
});

vi.mock("@/lib/query-cache", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/query-cache")>();
  return { ...actual, invalidateQueryTag: vi.fn() };
});

function makeApiError(status: number, code?: string, message = "Mensaje del backend") {
  return new ApiRequestError(status, {
    statusCode: status,
    code,
    message,
    error: "Conflict",
    timestamp: "2026-07-26T00:00:00.000Z",
    path: "/budget/planning-lines/line-1/submit",
  });
}

describe("POA planning line state conflict recovery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recognizes only status 409 with the stable conflict code", () => {
    expect(
      isPlanningLineStateConflict(
        makeApiError(409, PLANNING_LINE_STATE_CONFLICT_CODE),
      ),
    ).toBe(true);
    expect(
      isPlanningLineStateConflict(
        makeApiError(400, PLANNING_LINE_STATE_CONFLICT_CODE),
      ),
    ).toBe(false);
    expect(isPlanningLineStateConflict(makeApiError(409, "OTHER_CONFLICT"))).toBe(
      false,
    );
    expect(isPlanningLineStateConflict(new Error("409"))).toBe(false);
  });

  it("returns the safe backend message and invalidates detail/list/children domains", () => {
    const message = recoverFromPlanningLineStateConflict(
      makeApiError(
        409,
        PLANNING_LINE_STATE_CONFLICT_CODE,
        "La línea ya fue aprobada.",
      ),
    );

    expect(message).toBe("La línea ya fue aprobada.");
    expect(invalidateQueryTag).toHaveBeenCalledWith("poa");
    expect(invalidateQueryTag).toHaveBeenCalledWith("budget");
    expect(invalidateQueryTag).toHaveBeenCalledTimes(2);
  });

  it("does not recover or invalidate unrelated errors", () => {
    expect(recoverFromPlanningLineStateConflict(makeApiError(409, "OTHER"))).toBeNull();
    expect(invalidateQueryTag).not.toHaveBeenCalled();
  });
});

describe("POA monthly distribution contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the canonical monthly collection endpoint", async () => {
    const distribution = [
      {
        id: "monthly-1",
        planning_line_id: "line-1",
        month: 1,
        planned_amount: 100,
        executed_amount: 25,
      },
    ];
    vi.mocked(api.get).mockResolvedValueOnce(distribution);

    const { result } = renderHook(() => useMonthlyDistribution("line-1"));

    await waitFor(() => expect(result.current.data).toEqual(distribution));
    expect(api.get).toHaveBeenCalledWith(
      "/budget/planning-lines/line-1/monthly",
    );
  });
});
