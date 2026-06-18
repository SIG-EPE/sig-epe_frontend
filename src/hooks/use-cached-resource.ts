"use client";

import { useEffect, useRef, useState } from "react";

import { cachedQuery, logQueryCacheDiagnostic, stableSerialize } from "@/lib/query-cache";
import { useAuthStore } from "@/stores/auth-store";

export interface CachedResourceOptions<T> {
  enabled?: boolean;
  key: readonly unknown[];
  ttlMs: number;
  tags?: readonly string[];
  keepPreviousData?: boolean;
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
  return error instanceof DOMException && error.name === "AbortError";
}

export function useCachedResource<T>({
  enabled = true,
  key,
  ttlMs,
  tags = [],
  keepPreviousData = true,
  errorMessage = "Error al cargar datos",
  queryFn,
}: CachedResourceOptions<T>): CachedResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [forceNonce, setForceNonce] = useState(0);
  const sequenceRef = useRef(0);
  const dataRef = useRef<T | null>(null);
  const authIsLoading = useAuthStore((state) => state.isLoading);
  const accessToken = useAuthStore((state) => state.accessToken);
  const keySignature = stableSerialize(key);
  const tagsSignature = stableSerialize(tags);

  async function refetch(options?: { force?: boolean }): Promise<void> {
    if (options?.force) setForceNonce((current) => current + 1);
    else setRefreshNonce((current) => current + 1);
  }

  useEffect(() => {
    if (!enabled || authIsLoading || !accessToken) return;

    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    const hasPreviousData = keepPreviousData && dataRef.current !== null;
    if (!keepPreviousData) dataRef.current = null;
    setIsInitialLoading(!hasPreviousData);
    setIsRefreshing(hasPreviousData);
    setError(null);

    cachedQuery<T>({
      key,
      ttlMs,
      tags,
      force: forceNonce > 0,
      queryFn: (signal) => queryFn(signal),
    })
      .then((result) => {
        if (sequenceRef.current !== sequence) {
          logQueryCacheDiagnostic("stale-response-ignore", key);
          return;
        }
        dataRef.current = result;
        setData(result);
      })
      .catch((unknownError: unknown) => {
        if (sequenceRef.current !== sequence) return;
        if (!isAbortError(unknownError)) {
          setError(unknownError instanceof Error ? unknownError : new Error(errorMessage));
        }
      })
      .finally(() => {
        if (sequenceRef.current === sequence) {
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
      });
  }, [enabled, authIsLoading, accessToken, keySignature, tagsSignature, ttlMs, keepPreviousData, refreshNonce, forceNonce]);

  return { data, isLoading: isInitialLoading, isInitialLoading, isRefreshing, error, refetch };
}
