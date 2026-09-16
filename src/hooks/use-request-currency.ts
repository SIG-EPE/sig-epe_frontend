"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { cachedQuery, getQueryCacheAuthNamespace, stableSerialize, QUERY_CACHE_TTL_MS } from "@/lib/query-cache";
import { QUERY_TAGS } from "@/lib/query-tags";
import { canPreviewPenBudget } from "@/lib/request-currency-policy";
import { requestMoneyError } from "@/lib/request-form-money";
import { useAuthStore } from "@/stores/auth-store";
import type { BudgetPreviewInput, RequestAllocationsBudgetPreview, RequestAnnualUitLookup, RequestBudgetPreview, RequestFxReferenceResult } from "@/types/requests";

interface LookupResult<T> {
  key: string;
  data: T | null;
  error: Error | null;
  loading: boolean;
}

// La identidad visible incluye la sesión, no el token ni snapshots privados.
function useScopedLookup<T>(key: readonly unknown[], enabled: boolean, delay: number, load: (signal: AbortSignal, force: boolean) => Promise<T>) {
  const token = useAuthStore((state) => state.accessToken);
  const authLoading = useAuthStore((state) => state.isLoading);
  const identity = stableSerialize([getQueryCacheAuthNamespace(), ...key]);
  const allowed = enabled && !authLoading && Boolean(token);
  const current = useRef({ identity, allowed, token });
  current.current = { identity, allowed, token };
  const sequence = useRef(0);
  const [result, setResult] = useState<LookupResult<T> | null>(null);
  const [nonce, setNonce] = useState(0);
  const forceNext = useRef(false);

  useEffect(() => {
    const serial = ++sequence.current;
    if (!allowed) return;
    const force = forceNext.current;
    forceNext.current = false;
    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted && sequence.current === serial
      && current.current.identity === identity && current.current.allowed && current.current.token === token;
    setResult({ key: identity, data: null, error: null, loading: true });
    const timer = window.setTimeout(() => {
      void load(controller.signal, force).then((data) => {
        if (isCurrent()) setResult({ key: identity, data, error: null, loading: false });
      }).catch((error: unknown) => {
        if (isCurrent()) setResult({ key: identity, data: null, error: error instanceof Error ? error : new Error("No se pudo cargar la referencia."), loading: false });
      });
    }, delay);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [identity, allowed, token, nonce, delay]);

  const visible = allowed && result?.key === identity ? result : null;
  async function refetch() {
    // Una referencia manual retenida por un consumidor tampoco puede revivir otro contexto.
    if (!allowed || !current.current.allowed || current.current.identity !== identity || current.current.token !== token) return;
    forceNext.current = true;
    setResult(null);
    setNonce((value) => value + 1);
  }
  return { data: visible?.data ?? null, error: visible?.error ?? null, isLoading: allowed && (visible?.loading ?? true), refetch };
}

export function useRequestFxReference(enabled = true) {
  return useScopedLookup<RequestFxReferenceResult>(["requests", "fx-reference"], enabled, 0, (signal, force) => cachedQuery({
    key: ["requests", "fx-reference"], ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST, signal,
    force,
    queryFn: (requestSignal) => api.get<RequestFxReferenceResult>("/requests/lookups/fx-reference", { signal: requestSignal }),
  }));
}

export function useRequestAnnualUit(year: number | null | undefined, enabled: boolean) {
  const resource = useScopedLookup<RequestAnnualUitLookup>(["requests", "annual-uit", year], enabled && Number.isInteger(year), 0, (signal, force) => cachedQuery({
    key: ["requests", "annual-uit", year], ttlMs: QUERY_CACHE_TTL_MS.CATALOG, signal,
    tags: [QUERY_TAGS.ANNUAL_UIT, QUERY_TAGS.BUDGET, QUERY_TAGS.CATALOG],
    force,
    queryFn: (requestSignal) => api.get<RequestAnnualUitLookup>(`/requests/lookups/annual-uit/${year}`, { signal: requestSignal }),
  }));
  const isResolved = resource.data !== null && resource.error === null && !resource.isLoading;
  return {
    ...resource,
    annualUit: isResolved ? resource.data?.annual_uit : undefined,
    isResolved,
  };
}

export function useBudgetPreview(input: BudgetPreviewInput) {
  const allocations = input.allocations ?? [];
  const hasBatch = allocations.length > 0 && allocations.every((item) => item.budget_planning_line_id && requestMoneyError(item.amount) === null);
  const hasLegacy = !allocations.length && Boolean(input.planningLineId && input.amount && input.amount > 0);
  const currencies = input.planningLineCurrencies ?? [];
  const canPreview = (hasBatch || hasLegacy) && currencies.length === (hasBatch ? allocations.length : 1)
    && canPreviewPenBudget(input.currency, currencies);
  const resource = useScopedLookup<RequestBudgetPreview | RequestAllocationsBudgetPreview>(["budget-preview", input], canPreview, 500, (signal) => {
    if (hasBatch) return api.post<RequestAllocationsBudgetPreview>("/requests/lookups/planning-lines/budget-preview", {
      allocations, month: input.month, request_id: input.requestId,
    }, { signal });
    const params = new URLSearchParams({ amount: String(input.amount) });
    if (input.month) params.set("month", String(input.month));
    if (input.requestId) params.set("request_id", input.requestId);
    return api.get<RequestBudgetPreview>(`/requests/lookups/planning-lines/${input.planningLineId}/budget-preview?${params}`, { signal });
  });
  return { ...resource, canPreview };
}
