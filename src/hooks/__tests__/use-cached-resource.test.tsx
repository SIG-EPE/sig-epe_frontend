import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCachedResource } from "@/hooks/use-cached-resource";
import { clearQueryCache, QUERY_CACHE_TTL_MS, setQueryCacheAuthNamespace } from "@/lib/query-cache";

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

describe("useCachedResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
    setQueryCacheAuthNamespace("cached-resource-test:ADMIN");
  });

  it("deduplica consumidores con la misma clave", async () => {
    const pending = deferred<{ value: string }>();
    const queryFn = vi.fn(() => pending.promise);

    const first = renderHook(() => useCachedResource<{ value: string }>({ key: ["requests", "list"], ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST, queryFn }));
    const second = renderHook(() => useCachedResource<{ value: string }>({ key: ["requests", "list"], ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST, queryFn }));

    expect(queryFn).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ value: "ok" });
      await pending.promise;
    });

    await waitFor(() => expect(first.result.current.data?.value).toBe("ok"));
    expect(second.result.current.data?.value).toBe("ok");
  });

  it("mantiene datos previos durante refetch e ignora respuesta obsoleta", async () => {
    const queryFn = vi.fn().mockResolvedValueOnce({ value: "inicial" });
    const { result } = renderHook(() => useCachedResource<{ value: string }>({ key: ["users", "list"], ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST, queryFn }));

    await waitFor(() => expect(result.current.data?.value).toBe("inicial"));

    const slow = deferred<{ value: string }>();
    const fast = deferred<{ value: string }>();
    queryFn.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    act(() => {
      void result.current.refetch({ force: true });
    });
    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.data?.value).toBe("inicial");

    act(() => {
      void result.current.refetch({ force: true });
    });

    await act(async () => {
      fast.resolve({ value: "vigente" });
      await fast.promise;
    });
    await act(async () => {
      slow.resolve({ value: "obsoleta" });
      await slow.promise;
    });

    await waitFor(() => expect(result.current.data?.value).toBe("vigente"));
    expect(result.current.isRefreshing).toBe(false);
  });
});
