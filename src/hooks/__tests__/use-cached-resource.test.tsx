import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CACHED_RESOURCE_CACHE_MODE, useCachedResource } from "@/hooks/use-cached-resource";
import { clearQueryCache, QUERY_CACHE_TTL_MS, setQueryCacheAuthNamespace } from "@/lib/query-cache";

const authState = vi.hoisted(() => ({
  value: { isLoading: false, accessToken: "token" as string | null },
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: { isLoading: boolean; accessToken: string | null }) => unknown) => selector(authState.value),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe("useCachedResource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQueryCache();
    setQueryCacheAuthNamespace("cached-resource-test:ADMIN");
    authState.value = { isLoading: false, accessToken: "token" };
  });

  it("muestra loading en el primer render antes de que el efecto dispare la consulta", () => {
    const pending = deferred<{ value: string }>();
    const queryFn = vi.fn(() => pending.promise);

    const { result } = renderHook(() => useCachedResource<{ value: string }>({
      key: ["requests", "list", { scope: "review" }],
      ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
      keepPreviousData: false,
      queryFn,
    }));

    expect(result.current.data).toBeNull();
    expect(result.current.isInitialLoading).toBe(true);
    expect(result.current.isLoading).toBe(true);
  });

  it("mantiene loading inicial mientras la autenticación aún no habilita la consulta", async () => {
    authState.value = { isLoading: true, accessToken: null };
    const queryFn = vi.fn().mockResolvedValue({ value: "mis solicitudes" });

    const { result, rerender } = renderHook(() => useCachedResource<{ value: string }>({
      key: ["requests", "list", { scope: "mine", page: 1, limit: 20 }],
      ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
      keepPreviousData: false,
      queryFn,
    }));

    expect(result.current.data).toBeNull();
    expect(result.current.isInitialLoading).toBe(true);
    expect(result.current.isLoading).toBe(true);
    expect(queryFn).not.toHaveBeenCalled();

    authState.value = { isLoading: false, accessToken: "token" };
    rerender();

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.data?.value).toBe("mis solicitudes"));
    expect(result.current.isLoading).toBe(false);
  });

  it("no aborta la solicitud deduplicada al desmontar uno de dos consumidores", async () => {
    const pending = deferred<{ value: string }>();
    let sharedSignal: AbortSignal | undefined;
    const queryFn = vi.fn((signal: AbortSignal) => {
      sharedSignal = signal;
      return new Promise<{ value: string }>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        pending.promise.then(resolve, reject);
      });
    });

    const first = renderHook(() => useCachedResource<{ value: string }>({ key: ["requests", "list"], ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST, queryFn }));
    const second = renderHook(() => useCachedResource<{ value: string }>({ key: ["requests", "list"], ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST, queryFn }));

    expect(queryFn).toHaveBeenCalledTimes(1);
    first.unmount();
    await act(async () => Promise.resolve());
    expect(sharedSignal?.aborted).toBe(false);

    await act(async () => {
      pending.resolve({ value: "ok" });
      await pending.promise;
    });

    await waitFor(() => expect(second.result.current.data?.value).toBe("ok"));
  });

  it("resuelve con abort real durante el replay de StrictMode", async () => {
    const pending = deferred<{ value: string }>();
    const queryFn = vi.fn((signal: AbortSignal) => new Promise<{ value: string }>((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      pending.promise.then(resolve, reject);
    }));
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

    const { result } = renderHook(() => useCachedResource<{ value: string }>({
      key: ["requests", "strict-mode"],
      ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
      queryFn,
    }), { wrapper });

    await act(async () => {
      pending.resolve({ value: "vigente" });
      await pending.promise;
    });

    await waitFor(() => expect(result.current.data?.value).toBe("vigente"));
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("conserva o relanza A al cambiar A a B y volver a A rápidamente", async () => {
    const requestA = deferred<{ value: string }>();
    const requestB = deferred<{ value: string }>();
    const signals = new Map<string, AbortSignal>();
    const queryFn = vi.fn((signal: AbortSignal, key: string) => {
      signals.set(key, signal);
      const pending = key === "A" ? requestA : requestB;
      return new Promise<{ value: string }>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        pending.promise.then(resolve, reject);
      });
    });
    const { result, rerender } = renderHook(
      ({ keyPart }: { keyPart: string }) => useCachedResource<{ value: string }>({
        key: ["requests", keyPart],
        ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
        keepPreviousData: false,
        queryFn: (signal) => queryFn(signal, keyPart),
      }),
      { initialProps: { keyPart: "A" } },
    );

    rerender({ keyPart: "B" });
    expect(queryFn.mock.calls.some(([, key]) => key === "B")).toBe(true);
    rerender({ keyPart: "A" });

    await act(async () => {
      requestA.resolve({ value: "A vigente" });
      await requestA.promise;
    });

    await waitFor(() => expect(result.current.data?.value).toBe("A vigente"));
    expect(signals.get("A")?.aborted).toBe(false);
    expect(queryFn.mock.calls.filter(([, key]) => key === "A")).toHaveLength(1);
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

  it("limpia el error visible al reintentar una bandeja fallida", async () => {
    const queryFn = vi.fn()
      .mockRejectedValueOnce(new Error("No cargó la bandeja"))
      .mockResolvedValueOnce({ value: "recuperada" });
    const { result } = renderHook(() => useCachedResource<{ value: string }>({
      key: ["requests", "list", { scope: "review" }],
      ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
      queryFn,
    }));

    await waitFor(() => expect(result.current.error?.message).toBe("No cargó la bandeja"));

    act(() => {
      void result.current.refetch({ force: true });
    });

    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.data?.value).toBe("recuperada"));
    expect(result.current.error).toBeNull();
  });

  it("descarta datos previos cuando cambia la clave y keepPreviousData está desactivado", async () => {
    const reviewLoad = deferred<{ value: string }>();
    const queryFn = vi.fn()
      .mockResolvedValueOnce({ value: "mis solicitudes" })
      .mockReturnValueOnce(reviewLoad.promise);
    const { result, rerender } = renderHook(
      ({ scope }: { scope: string }) => useCachedResource<{ value: string }>({
        key: ["requests", "list", { scope }],
        ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
        keepPreviousData: false,
        queryFn,
      }),
      { initialProps: { scope: "mine" } },
    );

    await waitFor(() => expect(result.current.data?.value).toBe("mis solicitudes"));

    rerender({ scope: "review" });

    await waitFor(() => expect(result.current.isInitialLoading).toBe(true));
    expect(result.current.data).toBeNull();

    await act(async () => {
      reviewLoad.resolve({ value: "bandeja revisión" });
      await reviewLoad.promise;
    });

    await waitFor(() => expect(result.current.data?.value).toBe("bandeja revisión"));
  });

  it("no reutiliza respuestas cacheadas cuando cacheMode es no-store", async () => {
    const queryFn = vi.fn()
      .mockResolvedValueOnce({ value: "respuesta inicial" })
      .mockResolvedValueOnce({ value: "respuesta directa" });

    const first = renderHook(() => useCachedResource<{ value: string }>({
      key: ["requests", "list", { scope: "mine" }],
      ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
      queryFn,
    }));

    await waitFor(() => expect(first.result.current.data?.value).toBe("respuesta inicial"));
    first.unmount();

    const second = renderHook(() => useCachedResource<{ value: string }>({
      key: ["requests", "list", { scope: "mine" }],
      ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
      cacheMode: CACHED_RESOURCE_CACHE_MODE.NO_STORE,
      keepPreviousData: false,
      queryFn,
    }));

    expect(second.result.current.isLoading).toBe(true);
    await waitFor(() => expect(second.result.current.data?.value).toBe("respuesta directa"));
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("ignora una respuesta vacía obsoleta cuando cambia de scope", async () => {
    const emptyReview = deferred<{ value: string }>();
    const mineResult = deferred<{ value: string }>();
    const queryFn = vi.fn()
      .mockReturnValueOnce(emptyReview.promise)
      .mockReturnValueOnce(mineResult.promise);

    const { result, rerender } = renderHook(
      ({ scope }: { scope: string }) => useCachedResource<{ value: string }>({
        key: ["requests", "list", { scope }],
        ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
        cacheMode: CACHED_RESOURCE_CACHE_MODE.NO_STORE,
        keepPreviousData: false,
        queryFn,
      }),
      { initialProps: { scope: "review" } },
    );

    rerender({ scope: "mine" });

    await act(async () => {
      emptyReview.resolve({ value: "vacío obsoleto" });
      await emptyReview.promise;
    });
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      mineResult.resolve({ value: "mis solicitudes vigentes" });
      await mineResult.promise;
    });

    await waitFor(() => expect(result.current.data?.value).toBe("mis solicitudes vigentes"));
  });
});
