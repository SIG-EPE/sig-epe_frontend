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

  it("mantiene viva la solicitud compartida mientras quede otro consumidor", async () => {
    const pending = deferred<string>();
    const firstConsumer = new AbortController();
    const secondConsumer = new AbortController();
    let sharedSignal: AbortSignal | undefined;
    const queryFn = vi.fn((signal: AbortSignal) => {
      sharedSignal = signal;
      return pending.promise;
    });

    const first = cachedQuery({
      key: ["shared", "two-consumers"],
      ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
      signal: firstConsumer.signal,
      queryFn,
    });
    const second = cachedQuery({
      key: ["shared", "two-consumers"],
      ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
      signal: secondConsumer.signal,
      queryFn,
    });

    firstConsumer.abort();
    await Promise.resolve();

    expect(sharedSignal?.aborted).toBe(false);
    pending.resolve("ok");
    await expect(Promise.all([first, second])).resolves.toEqual(["ok", "ok"]);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("aborta al salir el último consumidor y no reutiliza el in-flight condenado", async () => {
    const consumer = new AbortController();
    const sharedSignals: AbortSignal[] = [];
    const queryFn = vi.fn((signal: AbortSignal) => {
      sharedSignals.push(signal);
      if (queryFn.mock.calls.length > 1) return Promise.resolve("replacement");
      return new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    });

    const abandoned = cachedQuery({
      key: ["shared", "last-consumer"],
      ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
      signal: consumer.signal,
      queryFn,
    });
    const abandonedResult = abandoned.catch((error: unknown) => error);

    consumer.abort();
    await Promise.resolve();

    expect(sharedSignals[0]?.aborted).toBe(true);
    await expect(cachedQuery({
      key: ["shared", "last-consumer"],
      ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
      queryFn,
    })).resolves.toBe("replacement");
    expect(queryFn).toHaveBeenCalledTimes(2);
    await expect(abandonedResult).resolves.toMatchObject({ name: "AbortError" });
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
