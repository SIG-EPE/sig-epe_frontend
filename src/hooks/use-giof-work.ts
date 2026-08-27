"use client";

import { useEffect, useRef, useState } from "react";

import { api, ApiRequestError } from "@/lib/api-client";
import { bindGiofLeaseCredential, isGiofLeaseCurrent, unbindGiofLeaseCredential } from "@/lib/giof-work-lease-session";
import { invalidateRequestDomain } from "@/lib/query-tags";
import type {
  GiofAssigneeCandidate,
  GiofAssignmentHistoryItem,
  GiofBulkAssignInput,
  GiofBulkAssignResponse,
  GiofWorkLease,
  GiofWorkMetadata,
  GiofWorkPool,
} from "@/types/giof-work";

const DEFAULT_HEARTBEAT_MS = 60_000;

function toExpectedVersion(version: string): number {
  const value = Number(version);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("La versión de asignación no es válida. Actualiza la bandeja.");
  return value;
}

export function getGiofConflictMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 409) {
    return "La asignación o sesión de trabajo cambió, venció o pertenece a otra persona. Actualiza la bandeja antes de continuar.";
  }
  return error instanceof Error ? error.message : "No se pudo completar la operación GIOF.";
}

export function useGiofWorkLease() {
  const [lease, setLease] = useState<GiofWorkLease | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const leaseRef = useRef<GiofWorkLease | null>(null);
  const aliasesRef = useRef<readonly string[]>([]);

  function storeLease(nextLease: GiofWorkLease | null, aliases?: readonly string[]): void {
    if (leaseRef.current) unbindGiofLeaseCredential(leaseRef.current);
    if (aliases) aliasesRef.current = aliases;
    leaseRef.current = nextLease;
    setLease(nextLease);
    if (nextLease) bindGiofLeaseCredential(nextLease, aliasesRef.current);
    else aliasesRef.current = [];
  }

  async function release(): Promise<void> {
    const current = leaseRef.current;
    if (!current) return;
    storeLease(null);
    await api.post<{ released: true }>("/giof-work/leases/release", {
      pool: current.pool,
      requestId: current.requestId,
      expectedVersion: toExpectedVersion(current.assignmentVersion),
      token: current.token,
    }).catch(() => undefined);
    invalidateRequestDomain(current.requestId);
  }

  async function acquire(requestId: string, work: GiofWorkMetadata, aliases: readonly string[] = []): Promise<GiofWorkLease> {
    if (!work.canAcquire) throw new Error("Este trabajo está disponible únicamente en modo de solo lectura.");
    if (leaseRef.current?.requestId !== requestId) await release();
    setIsLoading(true);
    setError(null);
    try {
      const nextLease = await api.post<GiofWorkLease>("/giof-work/leases/acquire", {
        pool: work.pool,
        requestId,
        expectedVersion: toExpectedVersion(work.assignmentVersion),
      });
      storeLease(nextLease, aliases);
      invalidateRequestDomain(requestId);
      return nextLease;
    } catch (reason) {
      const nextError = new Error(getGiofConflictMessage(reason));
      setError(nextError);
      throw nextError;
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!lease) return;
    const intervalMs = Math.max(10_000, (lease.heartbeatIntervalSeconds || 60) * 1_000 || DEFAULT_HEARTBEAT_MS);
    const intervalId = window.setInterval(() => {
      const current = leaseRef.current;
      if (!current) return;
      void api.post<GiofWorkLease>("/giof-work/leases/heartbeat", {
        pool: current.pool,
        requestId: current.requestId,
        expectedVersion: toExpectedVersion(current.assignmentVersion),
        token: current.token,
      }).then((renewed) => storeLease(renewed)).catch((reason: unknown) => {
        storeLease(null);
        setError(new Error(getGiofConflictMessage(reason)));
      });
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [lease?.token]);

  useEffect(() => () => {
    const current = leaseRef.current;
    if (!current) return;
    unbindGiofLeaseCredential(current);
    void api.post("/giof-work/leases/release", {
      pool: current.pool,
      requestId: current.requestId,
      expectedVersion: toExpectedVersion(current.assignmentVersion),
      token: current.token,
    }).catch(() => undefined);
  }, []);

  return { lease, acquire, release, isLoading, error, clearError: () => setError(null) };
}

export function useGiofWorkLeaseSet() {
  const [leases, setLeases] = useState<GiofWorkLease[]>([]);
  const leasesRef = useRef<GiofWorkLease[]>([]);
  const aliasesRef = useRef(new Map<string, readonly string[]>());

  function replaceLeases(next: GiofWorkLease[]): void {
    leasesRef.current = next;
    setLeases(next);
  }

  async function acquire(requestId: string, work: GiofWorkMetadata, aliases: readonly string[] = []): Promise<GiofWorkLease> {
    const existing = leasesRef.current.find((candidate) => candidate.requestId === requestId);
    if (isGiofLeaseCurrent(existing, { requestId, pool: work.pool, assignmentVersion: work.assignmentVersion })) return existing;
    if (existing) await release(requestId);
    if (!work.canAcquire) throw new Error("Este trabajo está disponible únicamente en modo de solo lectura.");
    try {
      const nextLease = await api.post<GiofWorkLease>("/giof-work/leases/acquire", {
        pool: work.pool,
        requestId,
        expectedVersion: toExpectedVersion(work.assignmentVersion),
      });
      aliasesRef.current.set(requestId, aliases);
      bindGiofLeaseCredential(nextLease, aliases);
      replaceLeases([...leasesRef.current, nextLease]);
      invalidateRequestDomain(requestId);
      return nextLease;
    } catch (reason) {
      throw new Error(getGiofConflictMessage(reason));
    }
  }

  async function release(requestId: string): Promise<void> {
    const current = leasesRef.current.find((candidate) => candidate.requestId === requestId);
    if (!current) return;
    unbindGiofLeaseCredential(current);
    aliasesRef.current.delete(requestId);
    replaceLeases(leasesRef.current.filter((candidate) => candidate.requestId !== requestId));
    await api.post("/giof-work/leases/release", { pool: current.pool, requestId, expectedVersion: toExpectedVersion(current.assignmentVersion), token: current.token }).catch(() => undefined);
  }

  async function releaseAll(): Promise<void> {
    await Promise.all(leasesRef.current.map((current) => release(current.requestId)));
  }

  useEffect(() => {
    if (leases.length === 0) return;
    const intervalId = window.setInterval(() => {
      for (const current of leasesRef.current) {
        void api.post<GiofWorkLease>("/giof-work/leases/heartbeat", { pool: current.pool, requestId: current.requestId, expectedVersion: toExpectedVersion(current.assignmentVersion), token: current.token })
          .then((renewed) => {
            unbindGiofLeaseCredential(current);
            bindGiofLeaseCredential(renewed, aliasesRef.current.get(renewed.requestId));
            replaceLeases(leasesRef.current.map((candidate) => candidate.requestId === renewed.requestId ? renewed : candidate));
          })
          .catch(() => {
            unbindGiofLeaseCredential(current);
            aliasesRef.current.delete(current.requestId);
            replaceLeases(leasesRef.current.filter((candidate) => candidate.requestId !== current.requestId));
          });
      }
    }, DEFAULT_HEARTBEAT_MS);
    return () => window.clearInterval(intervalId);
  }, [leases.length]);

  useEffect(() => () => {
    for (const current of leasesRef.current) {
      unbindGiofLeaseCredential(current);
      void api.post("/giof-work/leases/release", { pool: current.pool, requestId: current.requestId, expectedVersion: toExpectedVersion(current.assignmentVersion), token: current.token }).catch(() => undefined);
    }
  }, []);

  return { leases, acquire, release, releaseAll };
}

export async function fetchGiofAssignees(search?: string): Promise<GiofAssigneeCandidate[]> {
  const params = new URLSearchParams();
  if (search?.trim()) params.set("search", search.trim());
  return api.get<GiofAssigneeCandidate[]>(`/giof-work/assignees${params.size ? `?${params.toString()}` : ""}`);
}

export async function fetchGiofHistory(requestId: string, pool: GiofWorkPool): Promise<GiofAssignmentHistoryItem[]> {
  const params = new URLSearchParams({ requestId, pool });
  return api.get<GiofAssignmentHistoryItem[]>(`/giof-work/history?${params.toString()}`);
}

export async function bulkAssignGiofWork(input: GiofBulkAssignInput): Promise<GiofBulkAssignResponse> {
  const result = await api.post<GiofBulkAssignResponse>("/giof-work/assignments/bulk", input);
  invalidateRequestDomain();
  return result;
}
