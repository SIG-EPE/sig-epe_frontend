import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api-client";
import { clearQueryCache } from "@/lib/query-cache";
import { useApprovePlanningLine, usePlanningLine, usePlanningLines, usePlanningLineStats } from "@/hooks/use-budget";
import type { PlanningLine } from "@/types/budget";

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { isLoading: boolean; accessToken: string }) => unknown) =>
    selector({ isLoading: false, accessToken: "token" }),
}));
vi.mock("@/lib/api-client", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api-client")>();
  return { ...actual, api: { ...actual.api, get: vi.fn(), post: vi.fn() } };
});

const submitted = { id: "line-1", status: "SUBMITTED", total_cost: 120, monthlyDistribution: [] } as unknown as PlanningLine;
const approved = { ...submitted, status: "APPROVED", approved_at: "2026-09-27T12:00:00Z" } as PlanningLine;
const oldStats = { stats: { SUBMITTED: { count: 1, total: 120 }, APPROVED: { count: 0, total: 0 } } };
const newStats = { stats: { SUBMITTED: { count: 0, total: 0 }, APPROVED: { count: 1, total: 120 } } };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("POA approval hot refresh", () => {
  beforeEach(() => { vi.clearAllMocks(); clearQueryCache(); });

  it("uses the returned approved detail without another GET and ignores an older GET", async () => {
    const old = deferred<PlanningLine>();
    vi.mocked(api.get).mockReturnValueOnce(old.promise);
    vi.mocked(api.post).mockResolvedValueOnce(approved);
    const detail = renderHook(() => usePlanningLine("line-1"));
    const mutation = renderHook(() => useApprovePlanningLine("line-1"));
    await act(async () => { detail.result.current.applyApprovedLine(await mutation.result.current.approve()); });
    expect(detail.result.current.line).toEqual(approved);
    expect(api.get).toHaveBeenCalledTimes(1);
    await act(async () => { old.resolve(submitted); await old.promise; });
    expect(detail.result.current.line).toEqual(approved);
    detail.unmount(); mutation.unmount();
  });

  it("refetches mounted list and stats once after success, not after rejection; stale GET cannot restore old values", async () => {
    const oldList = deferred<{ lines: PlanningLine[]; total: number; page: number; limit: number }>();
    const oldStatistic = deferred<typeof oldStats>();
    const listResponse = (line: PlanningLine) => ({ lines: [line], total: 1, page: 1, limit: 20 });
    vi.mocked(api.get).mockImplementation((path) => {
      if (path.includes("/stats?")) return vi.mocked(api.get).mock.calls.filter(([p]) => String(p).includes("/stats?")).length === 1 ? oldStatistic.promise : Promise.resolve(newStats);
      return vi.mocked(api.get).mock.calls.filter(([p]) => String(p).includes("/budget/planning-lines?")).length === 1 ? oldList.promise : Promise.resolve(listResponse(approved));
    });
    vi.mocked(api.post).mockRejectedValueOnce(new Error("denied")).mockResolvedValueOnce(approved);
    const list = renderHook(() => usePlanningLines({ fiscal_year_id: "fy-1" }));
    const stats = renderHook(() => usePlanningLineStats("fy-1"));
    const mutation = renderHook(() => useApprovePlanningLine("line-1"));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    await act(async () => { await expect(mutation.result.current.approve()).rejects.toThrow("denied"); });
    expect(api.get).toHaveBeenCalledTimes(2);
    await act(async () => { await mutation.result.current.approve(); });
    await waitFor(() => expect(list.result.current.lines[0]?.status).toBe("APPROVED"));
    await waitFor(() => expect(stats.result.current.data?.APPROVED.count).toBe(1));
    expect(api.get).toHaveBeenCalledTimes(4);
    await act(async () => { oldList.resolve(listResponse(submitted)); oldStatistic.resolve(oldStats); await Promise.all([oldList.promise, oldStatistic.promise]); });
    expect(list.result.current.lines[0]?.status).toBe("APPROVED");
    expect(stats.result.current.data?.APPROVED.count).toBe(1);
    expect(vi.mocked(api.get).mock.calls.find(([path]) => path.includes("/budget/planning-lines?"))?.[1]).toEqual({ signal: expect.any(AbortSignal) });
    list.unmount(); stats.unmount(); mutation.unmount();
  });
});
