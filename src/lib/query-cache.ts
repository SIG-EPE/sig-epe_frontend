const QUERY_CACHE_NAMESPACE_ANONYMOUS = "anonymous" as const;

export const QUERY_CACHE_TTL_MS = {
  DASHBOARD: 30_000,
  CATALOG: 5 * 60_000,
  POA_LOOKUP: 5 * 60_000,
  REQUEST_DETAIL: 30_000,
  MUTABLE_LIST: 15_000,
} as const;

type QueryCacheTtlKey = keyof typeof QUERY_CACHE_TTL_MS;

interface QueryCacheEntry<T> {
  data: T;
  expiresAt: number;
  tags: Set<string>;
  keyParts: readonly unknown[];
}

interface InFlightQuery<T> {
  promise: Promise<T>;
  controller: AbortController;
  consumers: Set<symbol>;
  tags: Set<string>;
  keyParts: readonly unknown[];
}

export interface CachedQueryOptions<T> {
  key: readonly unknown[];
  ttlMs: number;
  tags?: readonly string[];
  force?: boolean;
  signal?: AbortSignal;
  queryFn: (signal: AbortSignal) => Promise<T>;
}

const QUERY_CACHE_DEBUG_ENABLED =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_QUERY_CACHE_DEBUG === "true";

const cache = new Map<string, QueryCacheEntry<unknown>>();
const inFlight = new Map<string, InFlightQuery<unknown>>();

let authNamespace: string = QUERY_CACHE_NAMESPACE_ANONYMOUS;
let sessionGeneration = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableNormalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (!isRecord(value)) return String(value);

  return Object.keys(value)
    .sort((a, b) => a.localeCompare(b))
    .reduce<Record<string, unknown>>((normalized, key) => {
      const nextValue = value[key];
      if (nextValue !== undefined && nextValue !== "") normalized[key] = stableNormalize(nextValue);
      return normalized;
    }, {});
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(stableNormalize(value));
}

export function getQueryCacheAuthNamespace(): string {
  return `${authNamespace}:g${sessionGeneration}`;
}

export function setQueryCacheAuthNamespace(namespace: string): void {
  if (namespace === authNamespace) return;
  authNamespace = namespace;
  sessionGeneration += 1;
  clearQueryCache();
}

export function bumpQueryCacheSessionGeneration(): void {
  sessionGeneration += 1;
  clearQueryCache();
}

function buildScopedKey(key: readonly unknown[]): string {
  return stableSerialize(["auth", getQueryCacheAuthNamespace(), ...key]);
}

function getSafeDebugKey(key: readonly unknown[]): string {
  return stableSerialize(key);
}

function logQueryCacheDebug(event: string, key: readonly unknown[], details?: Record<string, unknown>): void {
  if (!QUERY_CACHE_DEBUG_ENABLED) return;
  console.debug("[query-cache]", event, { key: getSafeDebugKey(key), ...details });
}

export function logQueryCacheDiagnostic(event: string, key: readonly unknown[], details?: Record<string, unknown>): void {
  logQueryCacheDebug(event, key, details);
}

function isFresh(entry: QueryCacheEntry<unknown> | undefined, now = Date.now()): boolean {
  return Boolean(entry && entry.expiresAt > now);
}

function abortInFlight(cacheKey: string, entry: InFlightQuery<unknown>): void {
  if (inFlight.get(cacheKey) === entry) inFlight.delete(cacheKey);
  entry.controller.abort();
}

function subscribeToInFlight<T>(cacheKey: string, entry: InFlightQuery<unknown>, signal?: AbortSignal): Promise<T> {
  const consumer = Symbol(cacheKey);
  let isSubscribed = true;
  entry.consumers.add(consumer);

  const unsubscribe = () => {
    if (!isSubscribed) return;
    isSubscribed = false;
    signal?.removeEventListener("abort", unsubscribe);
    entry.consumers.delete(consumer);
    if (entry.consumers.size > 0) return;

    queueMicrotask(() => {
      if (inFlight.get(cacheKey) !== entry || entry.consumers.size > 0) return;
      abortInFlight(cacheKey, entry);
    });
  };

  if (signal?.aborted) unsubscribe();
  else signal?.addEventListener("abort", unsubscribe, { once: true });

  void entry.promise.then(unsubscribe, unsubscribe);
  return entry.promise as Promise<T>;
}

export async function cachedQuery<T>({ key, ttlMs, tags = [], force = false, signal, queryFn }: CachedQueryOptions<T>): Promise<T> {
  const cacheKey = buildScopedKey(key);
  const cached = cache.get(cacheKey);
  if (!force && isFresh(cached)) {
    logQueryCacheDebug("hit", key);
    return cached?.data as T;
  }

  const currentInFlight = inFlight.get(cacheKey);
  if (!force && currentInFlight) {
    logQueryCacheDebug("dedupe", key);
    return subscribeToInFlight<T>(cacheKey, currentInFlight, signal);
  }

  if (force) {
    logQueryCacheDebug("force", key);
    const forcedEntry = inFlight.get(cacheKey);
    if (forcedEntry) abortInFlight(cacheKey, forcedEntry);
  }

  const startedAt = Date.now();
  logQueryCacheDebug("miss", key);

  const controller = new AbortController();
  const tagSet = new Set(tags);
  const promise = queryFn(controller.signal)
    .then((data) => {
      cache.set(cacheKey, { data, expiresAt: Date.now() + ttlMs, tags: tagSet, keyParts: key });
      logQueryCacheDebug("success", key, { latencyMs: Date.now() - startedAt });
      return data;
    })
    .catch((error: unknown) => {
      logQueryCacheDebug("error", key, {
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.name : "unknown",
      });
      throw error;
    })
    .finally(() => {
      if (inFlight.get(cacheKey)?.promise === promise) inFlight.delete(cacheKey);
    });

  const entry: InFlightQuery<unknown> = {
    promise,
    controller,
    consumers: new Set(),
    tags: tagSet,
    keyParts: key,
  };
  inFlight.set(cacheKey, entry);
  return subscribeToInFlight<T>(cacheKey, entry, signal);
}

export function readCachedQuery<T>(key: readonly unknown[]): T | null {
  const entry = cache.get(buildScopedKey(key));
  return isFresh(entry) ? (entry?.data as T) : null;
}

export function invalidateQueryPrefix(prefix: readonly unknown[]): void {
  for (const [key, entry] of cache.entries()) {
    if (prefix.every((part, index) => stableSerialize(entry.keyParts[index]) === stableSerialize(part))) {
      logQueryCacheDebug("invalidate-prefix", entry.keyParts, { prefix: getSafeDebugKey(prefix) });
      cache.delete(key);
    }
  }
  for (const [key, entry] of inFlight.entries()) {
    if (prefix.every((part, index) => stableSerialize(entry.keyParts[index]) === stableSerialize(part))) {
      abortInFlight(key, entry);
    }
  }
}

export function invalidateQueryTag(tag: string): void {
  for (const [key, entry] of cache.entries()) {
    if (entry.tags.has(tag)) {
      logQueryCacheDebug("invalidate-tag", entry.keyParts, { tag });
      cache.delete(key);
    }
  }
  for (const [key, entry] of inFlight.entries()) {
    if (entry.tags.has(tag)) {
      abortInFlight(key, entry);
    }
  }
}

export function clearQueryCache(): void {
  cache.clear();
  const activeEntries = [...inFlight.values()];
  inFlight.clear();
  for (const entry of activeEntries) entry.controller.abort();
}

export type { QueryCacheTtlKey };
