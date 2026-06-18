import { StrictMode } from "react";
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBalance } from "@/hooks/use-budget";
import { api } from "@/lib/api-client";
import { clearQueryCache, setQueryCacheAuthNamespace } from "@/lib/query-cache";
import type { BalanceData } from "@/types/budget";

vi.mock("@/lib/api-client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  ApiRequestError: class ApiRequestError extends Error {},
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { isLoading: boolean; accessToken: string | null }) => unknown) => selector({ isLoading: false, accessToken: "token" }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function makeBalance(overrides: Partial<BalanceData> = {}): BalanceData {
  return {
    fiscal_year_id: "fy-1",
    total_planned: 100,
    total_committed: 20,
    total_executed: 10,
    available: 70,
    warning: false,
    from_cache: false,
    ...overrides,
  };
}

describe("useBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
    setQueryCacheAuthNamespace("balance-test:ADMIN");
  });

  it("deduplica el montaje doble de StrictMode para la misma clave", async () => {
    vi.mocked(api.get).mockResolvedValueOnce(makeBalance());

    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useBalance("fy-1", { org_unit_id: "org-1" }), { wrapper });

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/budget/balance/fy-1?org_unit_id=org-1");
    expect(result.current.data?.available).toBe(70);
  });

  it("mantiene datos previos durante refetch forzado e ignora respuestas obsoletas", async () => {
    vi.mocked(api.get).mockResolvedValueOnce(makeBalance({ available: 70 }));
    const { result } = renderHook(() => useBalance("fy-1"));

    await waitFor(() => expect(result.current.data?.available).toBe(70));

    const slow = deferred<BalanceData>();
    const fast = deferred<BalanceData>();
    vi.mocked(api.get)
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);

    let slowRefetch!: Promise<void>;
    let fastRefetch!: Promise<void>;
    act(() => {
      slowRefetch = result.current.refetch({ force: true });
    });
    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.data?.available).toBe(70);

    act(() => {
      fastRefetch = result.current.refetch({ force: true });
    });

    await act(async () => {
      fast.resolve(makeBalance({ available: 90 }));
      await fastRefetch;
    });
    await act(async () => {
      slow.resolve(makeBalance({ available: 10 }));
      await slowRefetch;
    });

    expect(result.current.data?.available).toBe(90);
    expect(result.current.isRefreshing).toBe(false);
  });
});
