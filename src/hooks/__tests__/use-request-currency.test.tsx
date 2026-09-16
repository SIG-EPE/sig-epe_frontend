import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api-client";
import { useBudgetPreview, useRequestFxReference } from "@/hooks/use-requests";
import { useRequestAnnualUit } from "@/hooks/use-request-currency";
import { setQueryCacheAuthNamespace, clearQueryCache, invalidateQueryTag } from "@/lib/query-cache";
import type { BudgetPreviewInput } from "@/types/requests";

const auth = vi.hoisted(() => ({ isLoading: false, accessToken: "session-a" }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: typeof auth) => unknown) => selector(auth) }));
vi.mock("@/lib/api-client", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
const pen: BudgetPreviewInput = { currency: "PEN", planningLineCurrencies: ["PEN"], allocations: [{ budget_planning_line_id: "a", amount: "100" }] };

describe("currency scoped lookups", () => {
  let session = 0;
  beforeEach(() => { vi.clearAllMocks(); clearQueryCache(); session += 1; auth.accessToken = `session-${session}`; setQueryCacheAuthNamespace(`session-${session}`); });
  it("ignores deferred PEN responses after USD switch, including stale manual refetch", async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { result, rerender } = renderHook((input) => useBudgetPreview(input), { initialProps: pen });
    await waitFor(() => expect(api.post).toHaveBeenCalledOnce());
    const oldRefetch = result.current.refetch;
    rerender({ ...pen, currency: "USD" });
    expect(result.current.canPreview).toBe(false);
    await act(async () => { resolve({ hard_block: true }); await oldRefetch(); await result.current.refetch(); });
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(api.post).toHaveBeenCalledOnce();
  });
  it("hides the old allocation result immediately and loads the new fingerprint", async () => {
    vi.mocked(api.post).mockResolvedValue({ marker: "old" });
    const { result, rerender } = renderHook((input) => useBudgetPreview(input), { initialProps: pen });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    rerender({ ...pen, allocations: [{ budget_planning_line_id: "b", amount: "200" }] });
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.post).mock.calls[1][1]).toMatchObject({ allocations: [{ budget_planning_line_id: "b", amount: "200" }] });
  });
  it("keeps disabled-provider unavailable honest and isolates auth sessions", async () => {
    const unavailable = { reference: null, direction: "PEN/USD", fallback: "UNAVAILABLE", last_refresh_failure: "PROVIDER_DISABLED" };
    vi.mocked(api.get).mockResolvedValue(unavailable);
    const { result, rerender } = renderHook(() => useRequestFxReference());
    await waitFor(() => expect(result.current.data).toEqual(unavailable));
    auth.accessToken = "";
    setQueryCacheAuthNamespace("anonymous");
    rerender();
    expect(result.current.data).toBeNull();
    auth.accessToken = "session-b";
    setQueryCacheAuthNamespace("b");
    vi.mocked(api.get).mockRejectedValue(new Error("403"));
    rerender();
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.error?.message).toBe("403"));
    expect(api.get).toHaveBeenCalledTimes(2);
  });
  it("loads only the requested year from the request-role endpoint and hides stale years", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ year: 2025, annual_uit: "5350.00" })
      .mockResolvedValueOnce({ year: 2026, annual_uit: "5500.00" });
    const { result, rerender } = renderHook(
      ({ year, enabled }) => useRequestAnnualUit(year, enabled),
      { initialProps: { year: 2025 as number | null, enabled: true } },
    );
    await waitFor(() => expect(result.current.annualUit).toBe("5350.00"));

    rerender({ year: 2026, enabled: true });
    expect(result.current.annualUit).toBeUndefined();
    await waitFor(() => expect(result.current.annualUit).toBe("5500.00"));

    rerender({ year: null, enabled: false });
    expect(result.current.annualUit).toBeUndefined();
    expect(result.current.error).toBeNull();
    expect(api.get).toHaveBeenNthCalledWith(1, "/requests/lookups/annual-uit/2025", expect.any(Object));
    expect(api.get).toHaveBeenNthCalledWith(2, "/requests/lookups/annual-uit/2026", expect.any(Object));
  });
  it("distinguishes a successful null from a 403 lookup error", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ year: 2026, annual_uit: null });
    const first = renderHook(() => useRequestAnnualUit(2026, true));
    await waitFor(() => expect(first.result.current.isResolved).toBe(true));
    expect(first.result.current.annualUit).toBeNull();
    first.unmount();

    setQueryCacheAuthNamespace("requester-b");
    vi.mocked(api.get).mockRejectedValueOnce(new Error("403"));
    const second = renderHook(() => useRequestAnnualUit(2026, true));
    await waitFor(() => expect(second.result.current.error?.message).toBe("403"));
    expect(second.result.current.annualUit).toBeUndefined();
    expect(second.result.current.isResolved).toBe(false);
  });
  it("invalidates a cached null and refetches the configured value", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ year: 2026, annual_uit: null })
      .mockResolvedValueOnce({ year: 2026, annual_uit: "5500.00" });
    const { result } = renderHook(() => useRequestAnnualUit(2026, true));
    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.annualUit).toBeNull();

    invalidateQueryTag("annual-uit");
    await act(async () => result.current.refetch());
    await waitFor(() => expect(result.current.annualUit).toBe("5500.00"));
    expect(api.get).toHaveBeenCalledTimes(2);
  });
  it("ignores a late old-year response", async () => {
    let resolveOld!: (value: { year: number; annual_uit: string }) => void;
    vi.mocked(api.get)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ year: 2026, annual_uit: "5500.00" });
    const { result, rerender } = renderHook((year: number) => useRequestAnnualUit(year, true), { initialProps: 2025 });
    await waitFor(() => expect(api.get).toHaveBeenCalledOnce());
    rerender(2026);
    await waitFor(() => expect(result.current.annualUit).toBe("5500.00"));
    await act(async () => resolveOld({ year: 2025, annual_uit: "5350.00" }));
    expect(result.current.annualUit).toBe("5500.00");
  });
});
