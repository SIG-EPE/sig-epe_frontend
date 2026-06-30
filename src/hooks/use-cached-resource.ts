"use client";

import { useEffect, useRef, useState } from "react";

import { cachedQuery, logQueryCacheDiagnostic, stableSerialize } from "@/lib/query-cache";
import { useAuthStore } from "@/stores/auth-store";

export const CACHED_RESOURCE_CACHE_MODE = {
  CACHE_FIRST: "cache-first",
  NO_STORE: "no-store",
} as const;

export type CachedResourceCacheMode = (typeof CACHED_RESOURCE_CACHE_MODE)[keyof typeof CACHED_RESOURCE_CACHE_MODE];

export interface CachedResourceOptions<T> {
  enabled?: boolean;
  key: readonly unknown[];
  ttlMs: number;
  tags?: readonly string[];
  keepPreviousData?: boolean;
  cacheMode?: CachedResourceCacheMode;
  errorMessage?: string;
  queryFn: (signal: AbortSignal) => Promise<T>;
}

export interface CachedResourceState<T> {
  data: T | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: (options?: { force?: boolean }) => Promise<void>;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useCachedResource<T>({
  enabled = true,
  key,
  ttlMs,
  tags = [],
  keepPreviousData = true,
  cacheMode = CACHED_RESOURCE_CACHE_MODE.CACHE_FIRST,
  errorMessage = "Error al cargar datos",
  queryFn,
}: CachedResourceOptions<T>): CachedResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loadedKeySignature, setLoadedKeySignature] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [errorKeySignature, setErrorKeySignature] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [forceNonce, setForceNonce] = useState(0);
  const sequenceRef = useRef(0);
  const dataRef = useRef<T | null>(null);
  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);
  const keySignature = stableSerialize(key);
  const tagsSignature = stableSerialize(tags);
  const isWaitingForAuth = enabled && (authIsLoading || !accessToken);

  async function refetch(options?: { force?: boolean }): Promise<void> {
    setError(null);
    if (options?.force) setForceNonce((current) => current + 1);
    else setRefreshNonce((current) => current + 1);
  }

  useEffect(() => {
    if (!enabled || authIsLoading || !accessToken) return;

    const controller = new AbortController();
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    const hasPreviousData = keepPreviousData && dataRef.current !== null;
    if (!keepPreviousData) {
      dataRef.current = null;
      setData(null);
      setLoadedKeySignature(null);
    }
    setIsInitialLoading(!hasPreviousData);
    setIsRefreshing(hasPreviousData);
    setError(null);
    setErrorKeySignature(null);

    const request = cacheMode === CACHED_RESOURCE_CACHE_MODE.NO_STORE
      ? queryFn(controller.signal)
      : cachedQuery<T>({
        key,
        ttlMs,
        tags,
        force: forceNonce > 0,
        signal: controller.signal,
        queryFn: (signal) => queryFn(signal),
      });

    request
      .then((result) => {
        if (sequenceRef.current !== sequence) {
          logQueryCacheDiagnostic("stale-response-ignore", key);
          return;
        }
        dataRef.current = result;
        setData(result);
        setLoadedKeySignature(keySignature);
      })
      .catch((unknownError: unknown) => {
        if (sequenceRef.current !== sequence) return;
        if (!isAbortError(unknownError)) {
          setError(unknownError instanceof Error ? unknownError : new Error(errorMessage));
          setErrorKeySignature(keySignature);
        }
      })
      .finally(() => {
        if (sequenceRef.current === sequence) {
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
      });

    return () => controller.abort();
  }, [enabled, authIsLoading, accessToken, keySignature, tagsSignature, ttlMs, keepPreviousData, cacheMode, refreshNonce, forceNonce]);

  const hasDataForCurrentKey = data !== null && loadedKeySignature === keySignature;
  const canExposePreviousData = keepPreviousData && data !== null;
  const visibleData = hasDataForCurrentKey || canExposePreviousData ? data : null;
  const visibleError = errorKeySignature === keySignature ? error : null;
  const effectiveIsInitialLoading = isWaitingForAuth
    || isInitialLoading
    || (enabled && !hasDataForCurrentKey && !canExposePreviousData && visibleError === null);

  return {
    data: visibleData,
    isLoading: effectiveIsInitialLoading,
    isInitialLoading: effectiveIsInitialLoading,
    isRefreshing,
    error: visibleError,
    refetch,
  };
}
