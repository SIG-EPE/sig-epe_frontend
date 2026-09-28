import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { api, ApiRequestError } from "@/lib/api-client";
import { invalidateQueryTag } from "@/lib/query-cache";
import {
  PLANNING_LINE_STATE_CONFLICT_CODE,
  isPlanningLineStateConflict,
  recoverFromPlanningLineStateConflict,
  useMonthlyDistribution,
  usePlanningLines,
  useCreatePlanningLine,
} from "@/hooks/use-budget";
import { clearQueryCache, setQueryCacheAuthNamespace } from "@/lib/query-cache";

const authState = vi.hoisted(() => ({
  value: { isLoading: false, accessToken: "token" as string | null },
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: typeof authState.value) => unknown) =>
    selector(authState.value),
}));

vi.mock("@/lib/api-client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    api: { ...actual.api, get: vi.fn(), post: vi.fn() },
  };
});

vi.mock("@/lib/query-cache", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/query-cache")>();
  return { ...actual, invalidateQueryTag: vi.fn() };
});

function makeApiError(
  status: number,
  code?: string,
  message = "Mensaje del backend",
) {
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
    expect(
      isPlanningLineStateConflict(makeApiError(409, "OTHER_CONFLICT")),
    ).toBe(false);
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
    expect(
      recoverFromPlanningLineStateConflict(makeApiError(409, "OTHER")),
    ).toBeNull();
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

describe("POA creation response contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the committed line id from the unwrapped API data and invalidates caches", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      id: "draft-from-server",
      status: "DRAFT",
    });
    const { result } = renderHook(() => useCreatePlanningLine());
    let created: { id: string } | undefined;
    await act(async () => {
      created = await result.current.create({
        fiscal_year_id: "fy-1",
        organizational_unit_id: "org-1",
        budget_category_id: "cat-1",
        planning_type: "PROGRAMA",
        unit_price: 0,
        quantity: 0,
      });
    });
    expect(api.post).toHaveBeenCalledWith(
      "/budget/planning-lines",
      expect.any(Object),
    );
    expect(created?.id).toBe("draft-from-server");
    expect(invalidateQueryTag).toHaveBeenCalledWith("budget");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("POA planning line code query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
    setQueryCacheAuthNamespace("planning-line-search-test");
    authState.value = { isLoading: false, accessToken: "token" };
  });

  it("trims and sends code with existing filters and omits blank code", async () => {
    vi.mocked(api.get).mockResolvedValue({
      lines: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    const { rerender } = renderHook(
      ({ code }: { code: string }) =>
        usePlanningLines({
          fiscal_year_id: "fy-1",
          org_unit_id: "ou-1",
          status: "APPROVED",
          code,
          page: 1,
        }),
      { initialProps: { code: "  PoA-17  " } },
    );

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/budget/planning-lines?fiscal_year_id=fy-1&org_unit_id=ou-1&status=APPROVED&code=PoA-17&page=1",
        { signal: expect.any(AbortSignal) },
      ),
    );

    rerender({ code: "   " });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.get).toHaveBeenLastCalledWith(
      "/budget/planning-lines?fiscal_year_id=fy-1&org_unit_id=ou-1&status=APPROVED&page=1",
      { signal: expect.any(AbortSignal) },
    );
  });

  it("does not let an obsolete code response overwrite the current result", async () => {
    const first = deferred<{
      lines: never[];
      total: number;
      page: number;
      limit: number;
    }>();
    const second = deferred<{
      lines: never[];
      total: number;
      page: number;
      limit: number;
    }>();
    vi.mocked(api.get)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ code }: { code: string }) => usePlanningLines({ code, page: 1 }),
      { initialProps: { code: "OLD" } },
    );
    rerender({ code: "NEW" });

    await act(async () => {
      second.resolve({ lines: [], total: 2, page: 1, limit: 20 });
      await second.promise;
    });
    await waitFor(() => expect(result.current.total).toBe(2));

    await act(async () => {
      first.resolve({ lines: [], total: 99, page: 1, limit: 20 });
      await first.promise;
    });
    expect(result.current.total).toBe(2);
  });
});
