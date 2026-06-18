import { beforeEach, describe, expect, it, vi } from "vitest";

import { bumpQueryCacheSessionGeneration, cachedQuery, clearQueryCache, invalidateQueryTag, QUERY_CACHE_TTL_MS, setQueryCacheAuthNamespace, stableSerialize } from "@/lib/query-cache";
import { invalidateCatalogDomain, invalidateRequestDomain, invalidateUserDomain, QUERY_TAGS } from "@/lib/query-tags";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("query-cache", () => {
  beforeEach(() => {
    vi.useRealTimers();
    clearQueryCache();
    setQueryCacheAuthNamespace("test-user:ADMIN");
  });

  it("serializa objetos con claves ordenadas y omite undefined", () => {
    expect(stableSerialize(["endpoint", { b: 2, a: 1, empty: "", skip: undefined }])).toBe(stableSerialize(["endpoint", { a: 1, b: 2 }]));
  });

  it("deduplica solicitudes en vuelo para la misma clave", async () => {
    const pending = deferred<{ ok: true }>();
    const queryFn = vi.fn(() => pending.promise);

    const first = cachedQuery({ key: ["dashboard", { id: "one" }], ttlMs: QUERY_CACHE_TTL_MS.DASHBOARD, queryFn });
    const second = cachedQuery({ key: ["dashboard", { id: "one" }], ttlMs: QUERY_CACHE_TTL_MS.DASHBOARD, queryFn });

    expect(queryFn).toHaveBeenCalledTimes(1);
    pending.resolve({ ok: true });
    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
  });

  it("reusa datos dentro del TTL e invalida por tag", async () => {
    const queryFn = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");

    await expect(cachedQuery({ key: ["catalog"], ttlMs: QUERY_CACHE_TTL_MS.CATALOG, tags: ["catalog"], queryFn })).resolves.toBe("first");
    await expect(cachedQuery({ key: ["catalog"], ttlMs: QUERY_CACHE_TTL_MS.CATALOG, tags: ["catalog"], queryFn })).resolves.toBe("first");
    invalidateQueryTag("catalog");
    await expect(cachedQuery({ key: ["catalog"], ttlMs: QUERY_CACHE_TTL_MS.CATALOG, tags: ["catalog"], queryFn })).resolves.toBe("second");

    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("segrega cache por namespace de sesión", async () => {
    const queryFn = vi.fn().mockResolvedValueOnce("user-a").mockResolvedValueOnce("user-b");

    setQueryCacheAuthNamespace("user-a:role");
    await cachedQuery({ key: ["requests"], ttlMs: QUERY_CACHE_TTL_MS.REQUEST_DETAIL, queryFn });
    setQueryCacheAuthNamespace("user-b:role");
    await expect(cachedQuery({ key: ["requests"], ttlMs: QUERY_CACHE_TTL_MS.REQUEST_DETAIL, queryFn })).resolves.toBe("user-b");

    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("fuerza refetch y aborta la solicitud anterior", async () => {
    const abortSpy = vi.fn();
    const first = deferred<string>();
    const queryFn = vi.fn((signal: AbortSignal) => {
      signal.addEventListener("abort", abortSpy);
      return queryFn.mock.calls.length === 1 ? first.promise : Promise.resolve("forced");
    });

    void cachedQuery({ key: ["dashboard"], ttlMs: QUERY_CACHE_TTL_MS.DASHBOARD, queryFn });
    await expect(cachedQuery({ key: ["dashboard"], ttlMs: QUERY_CACHE_TTL_MS.DASHBOARD, force: true, queryFn })).resolves.toBe("forced");

    expect(abortSpy).toHaveBeenCalledTimes(1);
  });

  it("limpia cache al cambiar generación de sesión", async () => {
    const queryFn = vi.fn().mockResolvedValueOnce("one").mockResolvedValueOnce("two");

    await cachedQuery({ key: ["auth-safe"], ttlMs: QUERY_CACHE_TTL_MS.CATALOG, queryFn });
    bumpQueryCacheSessionGeneration();
    await expect(cachedQuery({ key: ["auth-safe"], ttlMs: QUERY_CACHE_TTL_MS.CATALOG, queryFn })).resolves.toBe("two");

    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("invalida dominios estandarizados por helper", async () => {
    const queryFn = vi.fn()
      .mockResolvedValueOnce("requests-old")
      .mockResolvedValueOnce("users-old")
      .mockResolvedValueOnce("catalog-old")
      .mockResolvedValueOnce("requests-new")
      .mockResolvedValueOnce("users-new")
      .mockResolvedValueOnce("catalog-new");

    await cachedQuery({ key: [QUERY_TAGS.REQUESTS, "list"], ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST, tags: [QUERY_TAGS.REQUESTS], queryFn });
    await cachedQuery({ key: [QUERY_TAGS.USERS, "list"], ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST, tags: [QUERY_TAGS.USERS], queryFn });
    await cachedQuery({ key: [QUERY_TAGS.CATALOGS, "list"], ttlMs: QUERY_CACHE_TTL_MS.CATALOG, tags: [QUERY_TAGS.CATALOGS], queryFn });

    invalidateRequestDomain();
    invalidateUserDomain();
    invalidateCatalogDomain();

    await expect(cachedQuery({ key: [QUERY_TAGS.REQUESTS, "list"], ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST, tags: [QUERY_TAGS.REQUESTS], queryFn })).resolves.toBe("requests-new");
    await expect(cachedQuery({ key: [QUERY_TAGS.USERS, "list"], ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST, tags: [QUERY_TAGS.USERS], queryFn })).resolves.toBe("users-new");
    await expect(cachedQuery({ key: [QUERY_TAGS.CATALOGS, "list"], ttlMs: QUERY_CACHE_TTL_MS.CATALOG, tags: [QUERY_TAGS.CATALOGS], queryFn })).resolves.toBe("catalog-new");
  });
});
