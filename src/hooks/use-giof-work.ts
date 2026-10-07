"use client";

import { useEffect, useRef, useState } from "react";

import { useCachedResource } from "@/hooks/use-cached-resource";
import { api, ApiRequestError } from "@/lib/api-client";
import {
  bindGiofLeaseCredential,
  getGiofLeaseCredentialGeneration,
  isGiofLeaseCurrent,
  unbindGiofLeaseCredential,
} from "@/lib/giof-work-lease-session";
import { QUERY_CACHE_TTL_MS } from "@/lib/query-cache";
import {
  invalidateQueryPrefixes,
  invalidateRequestDomain,
  QUERY_TAGS,
} from "@/lib/query-tags";
import {
  GIOF_BULK_SELECTION_MAX,
  getGiofCurrentPageSelection,
  isGiofBulkSelectable,
  type GiofBulkSelectableWorkItem,
} from "@/lib/giof-bulk-selection";
import type {
  GiofAssigneeCandidate,
  GiofAssignmentHistoryItem,
  GiofBulkAssignInput,
  GiofBulkAssignResponse,
  GiofClaimableWorkPage,
  GiofForceReassignWorkCommand,
  GiofOwnershipCommandResult,
  GiofOwnershipErrorCode,
  GiofReleaseWorkCommand,
  GiofSelfBulkAssignInput,
  GiofSelfBulkAssignResponse,
  GiofSelfBulkAssignmentItem,
  GiofSelfClaimCommand,
  GiofSelfClaimResult,
  GiofWorkLease,
  GiofWorkMetadata,
  GiofWorkPool,
  GiofBulkAssignmentMode,
} from "@/types/giof-work";
import { GIOF_OWNERSHIP_ERROR_CODE } from "@/types/giof-work";

const DEFAULT_HEARTBEAT_MS = 60_000;
const STALE_LEASE_OPERATION_MESSAGE =
  "La sesión operativa cambió mientras se procesaba la solicitud. Vuelve a abrir el trabajo.";

export function isExpectedPostCompletionLifecycleConflict(
  error: unknown,
): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status === 409 &&
    error.body.code === "GIOF_LIFECYCLE_CONFLICT"
  );
}

interface LeaseOperationFence {
  credentialGeneration: number;
  operationGeneration: number;
}

function toExpectedVersion(version: string): number {
  const value = Number(version);
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(
      "La versión de asignación no es válida. Actualiza la bandeja.",
    );
  return value;
}

export function getGiofConflictMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 401) {
    return "Tu sesión venció. Inicia sesión nuevamente antes de tomar trabajo.";
  }
  if (error instanceof ApiRequestError && error.status === 403) {
    return "No tienes permisos para tomar este trabajo.";
  }
  if (error instanceof ApiRequestError && error.status === 409) {
    const code = error.body.code;
    if (code === "ACTIVE_FOREIGN_LEASE" || code === "GIOF_LEASE_FOREIGN") {
      return "La solicitud tiene un lease activo de otra persona. No se modificó la asignación ni el pago.";
    }
    if (
      code === "VERSION_MISMATCH" ||
      code === "GIOF_ASSIGNMENT_VERSION_STALE"
    ) {
      return "La versión de asignación cambió. Actualiza la cola antes de reintentar.";
    }
    if (code === "ASSIGNEE_MISMATCH") {
      return "La solicitud está asignada a otra persona y no puede tomarse desde este lote.";
    }
    if (code === "ACTIVE_CROSS_POOL_LEASE") {
      return "La solicitud tiene una sesión de trabajo en otra etapa. Actualiza la cola antes de continuar.";
    }
    if (code === "NOT_FOUND") {
      return "El trabajo ya no está disponible. Actualiza la cola.";
    }
    if (code === "INELIGIBLE_LIFECYCLE") {
      return "El trabajo ya no es elegible para esta etapa. Actualiza la cola.";
    }
    return "La asignación o sesión de trabajo cambió, venció o pertenece a otra persona. Actualiza la bandeja antes de continuar.";
  }
  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación GIOF.";
}

export function getGiofOwnershipErrorCode(
  error: unknown,
): GiofOwnershipErrorCode | undefined {
  if (!(error instanceof ApiRequestError)) return undefined;
  const code = error.body.code;
  return Object.values(GIOF_OWNERSHIP_ERROR_CODE).includes(
    code as GiofOwnershipErrorCode,
  )
    ? (code as GiofOwnershipErrorCode)
    : undefined;
}

export function useGiofWorkLease() {
  const [lease, setLease] = useState<GiofWorkLease | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const leaseRef = useRef<GiofWorkLease | null>(null);
  const aliasesRef = useRef<readonly string[]>([]);
  const operationGenerationRef = useRef(0);

  function beginOperation(): LeaseOperationFence {
    operationGenerationRef.current += 1;
    return {
      credentialGeneration: getGiofLeaseCredentialGeneration(),
      operationGeneration: operationGenerationRef.current,
    };
  }

  function isOperationCurrent(fence: LeaseOperationFence): boolean {
    return (
      fence.operationGeneration === operationGenerationRef.current &&
      fence.credentialGeneration === getGiofLeaseCredentialGeneration()
    );
  }

  function storeLease(
    nextLease: GiofWorkLease | null,
    aliases?: readonly string[],
  ): void {
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
    beginOperation();
    storeLease(null);
    await api
      .post<{ released: true }>("/giof-work/leases/release", {
        pool: current.pool,
        requestId: current.requestId,
        expectedVersion: toExpectedVersion(current.assignmentVersion),
        token: current.token,
      })
      .catch(() => undefined);
    invalidateRequestDomain(current.requestId);
  }

  async function acquire(
    requestId: string,
    work: GiofWorkMetadata,
    aliases: readonly string[] = [],
  ): Promise<GiofWorkLease> {
    if (!work.canAcquire)
      throw new Error(
        "Este trabajo está disponible únicamente en modo de solo lectura.",
      );
    if (leaseRef.current?.requestId !== requestId) await release();
    setIsLoading(true);
    setError(null);
    const fence = beginOperation();
    try {
      const nextLease = await api.post<GiofWorkLease>(
        "/giof-work/leases/acquire",
        {
          pool: work.pool,
          requestId,
          expectedVersion: toExpectedVersion(work.assignmentVersion),
        },
      );
      if (!isOperationCurrent(fence))
        throw new Error(STALE_LEASE_OPERATION_MESSAGE);
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
    const intervalMs = Math.max(
      10_000,
      (lease.heartbeatIntervalSeconds || 60) * 1_000 || DEFAULT_HEARTBEAT_MS,
    );
    const intervalId = window.setInterval(() => {
      const current = leaseRef.current;
      if (!current) return;
      const fence = beginOperation();
      void api
        .post<GiofWorkLease>("/giof-work/leases/heartbeat", {
          pool: current.pool,
          requestId: current.requestId,
          expectedVersion: toExpectedVersion(current.assignmentVersion),
          token: current.token,
        })
        .then((renewed) => {
          if (
            !isOperationCurrent(fence) ||
            leaseRef.current?.token !== current.token
          )
            return;
          storeLease(renewed);
        })
        .catch((reason: unknown) => {
          if (
            !isOperationCurrent(fence) ||
            leaseRef.current?.token !== current.token
          )
            return;
          storeLease(null);
          setError(new Error(getGiofConflictMessage(reason)));
        });
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [lease?.token]);

  useEffect(
    () => () => {
      operationGenerationRef.current += 1;
      const current = leaseRef.current;
      if (!current) return;
      unbindGiofLeaseCredential(current);
      void api
        .post("/giof-work/leases/release", {
          pool: current.pool,
          requestId: current.requestId,
          expectedVersion: toExpectedVersion(current.assignmentVersion),
          token: current.token,
        })
        .catch(() => undefined);
    },
    [],
  );

  return {
    lease,
    acquire,
    release,
    isLoading,
    error,
    clearError: () => setError(null),
  };
}

interface AutoAcquireGiofWorkLeaseOptions {
  requestId?: string;
  work?: GiofWorkMetadata | null;
  aliases?: readonly string[];
  enabled?: boolean;
  onAcquired?: (lease: GiofWorkLease) => void | Promise<void>;
  onError?: (error: Error) => void;
}

function getGiofLeaseAttemptIdentity(
  requestId: string,
  work: GiofWorkMetadata,
): string {
  const parsedVersion = Number(work.assignmentVersion);
  const expectedVersion =
    Number.isSafeInteger(parsedVersion) && parsedVersion >= 0
      ? parsedVersion
      : work.assignmentVersion;
  return JSON.stringify([
    requestId,
    work.pool,
    expectedVersion,
    work.assigneeId ?? null,
  ]);
}

export function useAutoAcquireGiofWorkLease({
  requestId,
  work,
  aliases = [],
  enabled = true,
  onAcquired,
  onError,
}: AutoAcquireGiofWorkLeaseOptions) {
  const leaseSession = useGiofWorkLease();
  const attemptedIdentityRef = useRef<string | null>(null);
  const attemptIdentity =
    requestId && work ? getGiofLeaseAttemptIdentity(requestId, work) : null;

  useEffect(() => {
    if (
      !enabled ||
      !requestId ||
      !work ||
      !attemptIdentity ||
      leaseSession.lease ||
      leaseSession.isLoading ||
      attemptedIdentityRef.current === attemptIdentity
    )
      return;

    attemptedIdentityRef.current = attemptIdentity;
    void leaseSession
      .acquire(requestId, work, aliases)
      .then((nextLease) => onAcquired?.(nextLease))
      .catch((reason: unknown) => {
        const nextError =
          reason instanceof Error
            ? reason
            : new Error("Actualiza la solicitud antes de continuar.");
        onError?.(nextError);
      });
  }, [
    aliases,
    attemptIdentity,
    enabled,
    leaseSession.isLoading,
    leaseSession.lease,
    onAcquired,
    onError,
    requestId,
    work,
  ]);

  return leaseSession;
}

export function useGiofWorkLeaseSet(
  onLeaseLost?: (requestId: string, error: Error) => void,
) {
  const [leases, setLeases] = useState<GiofWorkLease[]>([]);
  const leasesRef = useRef<GiofWorkLease[]>([]);
  const aliasesRef = useRef(new Map<string, readonly string[]>());
  const operationGenerationsRef = useRef(new Map<string, number>());
  const explicitRenewalsRef = useRef(new Set<string>());
  const acknowledgedRequestsRef = useRef(new Set<string>());
  const releasedCapturedLeasesRef = useRef(new Set<string>());
  const onLeaseLostRef = useRef(onLeaseLost);
  onLeaseLostRef.current = onLeaseLost;

  function replaceLeases(next: GiofWorkLease[]): void {
    leasesRef.current = next;
    setLeases(next);
  }

  function beginOperation(requestId: string): LeaseOperationFence {
    const operationGeneration =
      (operationGenerationsRef.current.get(requestId) ?? 0) + 1;
    operationGenerationsRef.current.set(requestId, operationGeneration);
    return {
      credentialGeneration: getGiofLeaseCredentialGeneration(),
      operationGeneration,
    };
  }

  function isOperationCurrent(
    requestId: string,
    fence: LeaseOperationFence,
    token?: string,
  ): boolean {
    const tokenIsCurrent =
      token === undefined ||
      leasesRef.current.some(
        (candidate) =>
          candidate.requestId === requestId && candidate.token === token,
      );
    return (
      operationGenerationsRef.current.get(requestId) ===
        fence.operationGeneration &&
      getGiofLeaseCredentialGeneration() === fence.credentialGeneration &&
      tokenIsCurrent
    );
  }

  async function acquire(
    requestId: string,
    work: GiofWorkMetadata,
    aliases: readonly string[] = [],
  ): Promise<GiofWorkLease> {
    acknowledgedRequestsRef.current.delete(requestId);
    const existing = leasesRef.current.find(
      (candidate) => candidate.requestId === requestId,
    );
    if (
      isGiofLeaseCurrent(existing, {
        requestId,
        pool: work.pool,
        assignmentVersion: work.assignmentVersion,
      })
    ) {
      const mergedAliases = Array.from(
        new Set([...(aliasesRef.current.get(requestId) ?? []), ...aliases]),
      ).filter(Boolean);
      aliasesRef.current.set(requestId, mergedAliases);
      bindGiofLeaseCredential(existing, mergedAliases);
      return existing;
    }
    if (existing) await release(requestId);
    if (!work.canAcquire)
      throw new Error(
        "Este trabajo está disponible únicamente en modo de solo lectura.",
      );
    const fence = beginOperation(requestId);
    try {
      const nextLease = await api.post<GiofWorkLease>(
        "/giof-work/leases/acquire",
        {
          pool: work.pool,
          requestId,
          expectedVersion: toExpectedVersion(work.assignmentVersion),
        },
      );
      if (!isOperationCurrent(requestId, fence))
        throw new Error(STALE_LEASE_OPERATION_MESSAGE);
      aliasesRef.current.set(requestId, aliases);
      if (
        !bindGiofLeaseCredential(nextLease, aliases, fence.credentialGeneration)
      )
        throw new Error(STALE_LEASE_OPERATION_MESSAGE);
      replaceLeases([...leasesRef.current, nextLease]);
      invalidateRequestDomain(requestId);
      return nextLease;
    } catch (reason) {
      throw new Error(getGiofConflictMessage(reason));
    }
  }

  async function release(requestId: string): Promise<void> {
    const current = leasesRef.current.find(
      (candidate) => candidate.requestId === requestId,
    );
    if (!current) return;
    beginOperation(requestId);
    await api
      .post("/giof-work/leases/release", {
        pool: current.pool,
        requestId,
        expectedVersion: toExpectedVersion(current.assignmentVersion),
        token: current.token,
      })
      .catch(() => undefined);
    unbindGiofLeaseCredential(current);
    aliasesRef.current.delete(requestId);
    replaceLeases(
      leasesRef.current.filter(
        (candidate) => candidate.requestId !== requestId,
      ),
    );
  }

  async function releaseAll(): Promise<void> {
    await Promise.all(
      leasesRef.current.map((current) => release(current.requestId)),
    );
  }

  function clearLocal(): void {
    for (const [requestId, generation] of operationGenerationsRef.current) {
      operationGenerationsRef.current.set(requestId, generation + 1);
    }
    for (const current of leasesRef.current) {
      unbindGiofLeaseCredential(current);
    }
    aliasesRef.current.clear();
    replaceLeases([]);
  }

  function captureAndFence(requestId: string): GiofWorkLease | null {
    const current = leasesRef.current.find(
      (candidate) => candidate.requestId === requestId,
    );
    acknowledgedRequestsRef.current.add(requestId);
    beginOperation(requestId);
    if (!current) return null;
    unbindGiofLeaseCredential(current);
    aliasesRef.current.delete(requestId);
    replaceLeases(
      leasesRef.current.filter(
        (candidate) => candidate.requestId !== requestId,
      ),
    );
    return { ...current };
  }

  async function releaseCaptured(captured: GiofWorkLease): Promise<void> {
    const releaseIdentity = `${captured.requestId}:${captured.token}`;
    if (releasedCapturedLeasesRef.current.has(releaseIdentity)) return;
    releasedCapturedLeasesRef.current.add(releaseIdentity);
    await api
      .post("/giof-work/leases/release", {
        pool: captured.pool,
        requestId: captured.requestId,
        expectedVersion: toExpectedVersion(captured.assignmentVersion),
        token: captured.token,
      })
      .catch(() => undefined);
  }

  async function renew(requestId: string): Promise<GiofWorkLease> {
    const current = leasesRef.current.find(
      (candidate) => candidate.requestId === requestId,
    );
    if (!current) {
      throw new Error(
        "Falta la sesión operativa de este trabajo. Vuelve a abrirlo desde la bandeja.",
      );
    }
    explicitRenewalsRef.current.add(requestId);
    const fence = beginOperation(requestId);
    try {
      const renewed = await api.post<GiofWorkLease>(
        "/giof-work/leases/heartbeat",
        {
          pool: current.pool,
          requestId: current.requestId,
          expectedVersion: toExpectedVersion(current.assignmentVersion),
          token: current.token,
        },
      );
      if (!isOperationCurrent(requestId, fence, current.token))
        throw new Error(STALE_LEASE_OPERATION_MESSAGE);
      unbindGiofLeaseCredential(current);
      if (
        !bindGiofLeaseCredential(
          renewed,
          aliasesRef.current.get(renewed.requestId),
          fence.credentialGeneration,
        )
      )
        throw new Error(STALE_LEASE_OPERATION_MESSAGE);
      replaceLeases(
        leasesRef.current.map((candidate) =>
          candidate.requestId === renewed.requestId ? renewed : candidate,
        ),
      );
      return renewed;
    } catch (reason) {
      if (!isOperationCurrent(requestId, fence, current.token))
        throw new Error(STALE_LEASE_OPERATION_MESSAGE);
      await api
        .post("/giof-work/leases/release", {
          pool: current.pool,
          requestId: current.requestId,
          expectedVersion: toExpectedVersion(current.assignmentVersion),
          token: current.token,
        })
        .catch(() => undefined);
      unbindGiofLeaseCredential(current);
      aliasesRef.current.delete(current.requestId);
      replaceLeases(
        leasesRef.current.filter(
          (candidate) => candidate.requestId !== current.requestId,
        ),
      );
      throw new Error(getGiofConflictMessage(reason));
    } finally {
      explicitRenewalsRef.current.delete(requestId);
    }
  }

  useEffect(() => {
    if (leases.length === 0) return;
    const intervalId = window.setInterval(() => {
      for (const current of leasesRef.current) {
        if (explicitRenewalsRef.current.has(current.requestId)) continue;
        const fence: LeaseOperationFence = {
          credentialGeneration: getGiofLeaseCredentialGeneration(),
          operationGeneration:
            operationGenerationsRef.current.get(current.requestId) ?? 0,
        };
        void api
          .post<GiofWorkLease>("/giof-work/leases/heartbeat", {
            pool: current.pool,
            requestId: current.requestId,
            expectedVersion: toExpectedVersion(current.assignmentVersion),
            token: current.token,
          })
          .then((renewed) => {
            if (
              explicitRenewalsRef.current.has(current.requestId) ||
              !isOperationCurrent(current.requestId, fence, current.token)
            )
              return;
            unbindGiofLeaseCredential(current);
            if (
              !bindGiofLeaseCredential(
                renewed,
                aliasesRef.current.get(renewed.requestId),
                fence.credentialGeneration,
              )
            )
              return;
            replaceLeases(
              leasesRef.current.map((candidate) =>
                candidate.requestId === renewed.requestId ? renewed : candidate,
              ),
            );
          })
          .catch(async (reason: unknown) => {
            if (
              acknowledgedRequestsRef.current.has(current.requestId) &&
              isExpectedPostCompletionLifecycleConflict(reason)
            )
              return;
            if (
              explicitRenewalsRef.current.has(current.requestId) ||
              !isOperationCurrent(current.requestId, fence, current.token)
            )
              return;
            await api
              .post("/giof-work/leases/release", {
                pool: current.pool,
                requestId: current.requestId,
                expectedVersion: toExpectedVersion(current.assignmentVersion),
                token: current.token,
              })
              .catch(() => undefined);
            unbindGiofLeaseCredential(current);
            aliasesRef.current.delete(current.requestId);
            replaceLeases(
              leasesRef.current.filter(
                (candidate) => candidate.requestId !== current.requestId,
              ),
            );
            onLeaseLostRef.current?.(
              current.requestId,
              new Error(getGiofConflictMessage(reason)),
            );
          });
      }
    }, DEFAULT_HEARTBEAT_MS);
    return () => window.clearInterval(intervalId);
  }, [leases.length]);

  useEffect(
    () => () => {
      for (const [requestId, generation] of operationGenerationsRef.current) {
        operationGenerationsRef.current.set(requestId, generation + 1);
      }
      for (const current of leasesRef.current) {
        unbindGiofLeaseCredential(current);
        void api
          .post("/giof-work/leases/release", {
            pool: current.pool,
            requestId: current.requestId,
            expectedVersion: toExpectedVersion(current.assignmentVersion),
            token: current.token,
          })
          .catch(() => undefined);
      }
    },
    [],
  );

  return {
    leases,
    acquire,
    renew,
    release,
    releaseAll,
    clearLocal,
    captureAndFence,
    releaseCaptured,
  };
}

export async function fetchGiofAssignees(
  search?: string,
  signal?: AbortSignal,
): Promise<GiofAssigneeCandidate[]> {
  const params = new URLSearchParams();
  if (search?.trim()) params.set("search", search.trim());
  return api.get<GiofAssigneeCandidate[]>(
    `/giof-work/assignees${params.size ? `?${params.toString()}` : ""}`,
    { signal },
  );
}

interface GiofAssigneesOptions {
  enabled?: boolean;
  search?: string;
}

export function useGiofAssignees({
  enabled = true,
  search,
}: GiofAssigneesOptions = {}) {
  const normalizedSearch = search?.trim() ?? "";
  const resource = useCachedResource<GiofAssigneeCandidate[]>({
    enabled,
    key: [QUERY_TAGS.GIOF_WORK, "assignees", { search: normalizedSearch }],
    ttlMs: QUERY_CACHE_TTL_MS.CATALOG,
    tags: [QUERY_TAGS.CATALOGS, QUERY_TAGS.USERS],
    keepPreviousData: false,
    errorMessage: "No se pudo obtener el catálogo de responsables GIOF.",
    queryFn: (signal) =>
      fetchGiofAssignees(normalizedSearch || undefined, signal),
  });

  return {
    data: resource.data,
    isLoading: resource.isLoading,
    isInitialLoading: resource.isInitialLoading,
    isRefreshing: resource.isRefreshing,
    error: resource.error,
    refetch: resource.refetch,
  };
}

export async function fetchGiofHistory(
  requestId: string,
  pool: GiofWorkPool,
): Promise<GiofAssignmentHistoryItem[]> {
  const params = new URLSearchParams({ requestId, pool });
  return api.get<GiofAssignmentHistoryItem[]>(
    `/giof-work/history?${params.toString()}`,
  );
}

export async function bulkAssignGiofWork(
  input: GiofBulkAssignInput,
): Promise<GiofBulkAssignResponse> {
  const result = await api.post<GiofBulkAssignResponse>(
    "/giof-work/assignments/bulk",
    input,
  );
  invalidateRequestDomain();
  return result;
}

export async function bulkSelfAssignGiofWork(
  input: GiofSelfBulkAssignInput,
): Promise<GiofSelfBulkAssignResponse> {
  const payload: GiofSelfBulkAssignInput = {
    pool: input.pool,
    items: input.items.map(({ requestId, expectedAssignmentVersion }) => ({
      requestId,
      expectedAssignmentVersion,
    })),
  };
  return api.post<GiofSelfBulkAssignResponse>(
    "/giof-work/assignments/self/bulk",
    payload,
  );
}

export async function releaseGiofWork(
  command: GiofReleaseWorkCommand,
): Promise<GiofOwnershipCommandResult> {
  return api.post<GiofOwnershipCommandResult>(
    "/giof-work/assignments/release",
    command,
  );
}

export async function forceReassignGiofWork(
  command: GiofForceReassignWorkCommand,
): Promise<GiofOwnershipCommandResult> {
  return api.post<GiofOwnershipCommandResult>(
    "/giof-work/assignments/force-reassign",
    command,
  );
}

type GiofQueueRefetch = (options?: { force?: boolean }) => Promise<void>;

interface GiofBulkSelectionOptions {
  items: readonly GiofBulkSelectableWorkItem[];
  identity: string;
  mode: GiofBulkAssignmentMode;
}

export function useGiofBulkSelection({
  items,
  identity,
  mode,
}: GiofBulkSelectionOptions) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => setSelectedIds([]), [identity]);

  const selectedItems = getGiofCurrentPageSelection(items, selectedIds, mode);

  function toggle(requestId: string, checked: boolean): void {
    const item = items.find((candidate) => candidate.requestId === requestId);
    if (!item || !isGiofBulkSelectable(item.work, mode)) return;
    setSelectedIds((current) => {
      if (!checked) return current.filter((id) => id !== requestId);
      if (
        current.includes(requestId) ||
        current.length >= GIOF_BULK_SELECTION_MAX
      )
        return current;
      return [...current, requestId];
    });
  }

  function selectAll(): void {
    setSelectedIds(
      items
        .filter((item) => isGiofBulkSelectable(item.work, mode))
        .slice(0, GIOF_BULK_SELECTION_MAX)
        .map((item) => item.requestId),
    );
  }

  return {
    selectedIds: selectedItems.map((item) => item.requestId),
    selectedItems,
    toggle,
    selectAll,
    clear: () => setSelectedIds([]),
  };
}

interface GiofBulkSelfAssignmentOptions {
  pool: GiofWorkPool;
  onClearSelection: () => void;
  refetchPoolQueue: GiofQueueRefetch;
  refetchClaimable?: GiofQueueRefetch;
}

const UNKNOWN_BULK_COMPLETION_MESSAGE =
  "No se pudo confirmar cómo terminó la asignación. Actualiza las bandejas antes de reintentar; no se reintentará automáticamente.";

export function useGiofBulkSelfAssignment({
  pool,
  onClearSelection,
  refetchPoolQueue,
  refetchClaimable,
}: GiofBulkSelfAssignmentOptions) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<GiofSelfBulkAssignResponse | null>(null);
  const inFlightRef = useRef(false);

  async function refreshQueues(): Promise<void> {
    onClearSelection();
    invalidateQueryPrefixes([[QUERY_TAGS.GIOF_WORK, "claimable", pool]]);
    invalidateRequestDomain();
    await refetchPoolQueue({ force: true });
    if (refetchClaimable) await refetchClaimable({ force: true });
    else await refetchRegisteredClaimable(pool);
  }

  async function assign(
    items: readonly GiofSelfBulkAssignmentItem[],
  ): Promise<GiofSelfBulkAssignResponse> {
    if (inFlightRef.current)
      throw new Error("Ya hay una asignación masiva en curso.");
    if (items.length < 1 || items.length > GIOF_BULK_SELECTION_MAX)
      throw new Error("Selecciona entre 1 y 50 trabajos de la página actual.");
    if (new Set(items.map((item) => item.requestId)).size !== items.length)
      throw new Error("La selección contiene trabajos duplicados.");
    for (const item of items)
      toExpectedVersion(String(item.expectedAssignmentVersion));

    inFlightRef.current = true;
    setIsSubmitting(true);
    setError(null);
    setResult(null);
    try {
      let response: GiofSelfBulkAssignResponse;
      try {
        response = await bulkSelfAssignGiofWork({
          pool,
          items: [...items],
        });
      } catch (reason) {
        const isKnownConflict =
          reason instanceof ApiRequestError && reason.status === 409;
        const isUnknownCompletion =
          !(reason instanceof ApiRequestError) || reason.status >= 500;
        if (isKnownConflict || isUnknownCompletion)
          await refreshQueues().catch(() => undefined);
        const nextError = new Error(
          isUnknownCompletion
            ? UNKNOWN_BULK_COMPLETION_MESSAGE
            : getGiofConflictMessage(reason),
        );
        setError(nextError);
        throw nextError;
      }
      setResult(response);
      try {
        await refreshQueues();
      } catch {
        setError(
          new Error(
            "La asignación terminó, pero no se pudieron actualizar las bandejas. Actualízalas manualmente.",
          ),
        );
      }
      return response;
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  return {
    assign,
    isSubmitting,
    error,
    result,
    clearError: () => setError(null),
    clearResult: () => setResult(null),
  };
}

interface GiofOwnershipCommandOptions {
  pool?: GiofWorkPool;
  refetchPoolQueue?: GiofQueueRefetch;
  refetchClaimable?: GiofQueueRefetch;
}

const claimableRefetchers = new Map<GiofWorkPool, Set<GiofQueueRefetch>>();

export function registerGiofClaimableRefetch(
  pool: GiofWorkPool,
  refetch: GiofQueueRefetch,
): () => void {
  const refetchers =
    claimableRefetchers.get(pool) ?? new Set<GiofQueueRefetch>();
  refetchers.add(refetch);
  claimableRefetchers.set(pool, refetchers);
  return () => {
    refetchers.delete(refetch);
    if (refetchers.size === 0) claimableRefetchers.delete(pool);
  };
}

async function refetchRegisteredClaimable(pool: GiofWorkPool): Promise<void> {
  const refetchers = [...(claimableRefetchers.get(pool) ?? [])];
  await Promise.all(refetchers.map((refetch) => refetch({ force: true })));
}

export function useGiofOwnershipCommands({
  pool,
  refetchPoolQueue,
  refetchClaimable,
}: GiofOwnershipCommandOptions = {}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const inFlightRef = useRef(false);

  async function refreshQueues(requestId: string): Promise<void> {
    if (!pool || !refetchPoolQueue) return;
    invalidateQueryPrefixes([[QUERY_TAGS.GIOF_WORK, "claimable", pool]]);
    invalidateRequestDomain(requestId);
    await refetchPoolQueue({ force: true });
    if (refetchClaimable) await refetchClaimable({ force: true });
    else await refetchRegisteredClaimable(pool);
  }

  async function run(
    requestId: string,
    command: () => Promise<GiofOwnershipCommandResult>,
  ): Promise<GiofOwnershipCommandResult> {
    if (inFlightRef.current)
      throw new Error("Ya hay una acción de asignación en curso.");
    inFlightRef.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await command();
      await refreshQueues(requestId);
      return result;
    } catch (reason) {
      if (reason instanceof ApiRequestError && reason.status === 409) {
        await refreshQueues(requestId).catch(() => undefined);
      }
      const nextError = new Error(getGiofConflictMessage(reason));
      setError(nextError);
      throw reason;
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  return {
    release: (command: GiofReleaseWorkCommand) =>
      run(command.requestId, () => releaseGiofWork(command)),
    take: (command: GiofSelfClaimCommand) =>
      run(command.requestId, () => claimGiofWork(command)),
    forceReassign: (command: GiofForceReassignWorkCommand) =>
      run(command.requestId, () => forceReassignGiofWork(command)),
    isSubmitting,
    error,
    clearError: () => setError(null),
  };
}

export async function fetchGiofClaimableWork(
  pool: GiofWorkPool,
  page = 1,
  limit = 20,
  signal?: AbortSignal,
): Promise<GiofClaimableWorkPage> {
  const params = new URLSearchParams({
    pool,
    page: String(page),
    limit: String(limit),
  });
  return api.get<GiofClaimableWorkPage>(
    `/giof-work/claimable?${params.toString()}`,
    { signal },
  );
}

interface GiofClaimableWorkOptions {
  pool: GiofWorkPool;
  page?: number;
  limit?: number;
  enabled?: boolean;
}

export function useGiofClaimableWork({
  pool,
  page = 1,
  limit = 20,
  enabled = true,
}: GiofClaimableWorkOptions) {
  const resource = useCachedResource<GiofClaimableWorkPage>({
    enabled,
    key: [QUERY_TAGS.GIOF_WORK, "claimable", pool, { page, limit }],
    ttlMs: QUERY_CACHE_TTL_MS.MUTABLE_LIST,
    tags: [QUERY_TAGS.GIOF_WORK],
    keepPreviousData: false,
    errorMessage: "No se pudo obtener el trabajo disponible.",
    queryFn: (signal) => fetchGiofClaimableWork(pool, page, limit, signal),
  });

  return {
    items: resource.data?.items ?? [],
    total: resource.data?.total ?? 0,
    page: resource.data?.page ?? page,
    limit: resource.data?.limit ?? limit,
    isLoading: resource.isLoading,
    isInitialLoading: resource.isInitialLoading,
    isRefreshing: resource.isRefreshing,
    error: resource.error,
    refetch: resource.refetch,
    isAdvisory: true as const,
  };
}

export async function claimGiofWork(
  command: GiofSelfClaimCommand,
): Promise<GiofSelfClaimResult> {
  return api.post<GiofSelfClaimResult>("/giof-work/assignments/self", command);
}

type GiofClaimRefetch = (options?: { force?: boolean }) => Promise<void>;

interface GiofSelfClaimOptions {
  pool: GiofWorkPool;
  refetchClaimable: GiofClaimRefetch;
  refetchPoolQueue: GiofClaimRefetch;
}

interface GiofSelfClaimInput {
  requestId: string;
  expectedVersion: number;
}

export function useGiofSelfClaim({
  pool,
  refetchClaimable,
  refetchPoolQueue,
}: GiofSelfClaimOptions) {
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const inFlightRef = useRef<string | null>(null);

  async function claim(
    input: GiofSelfClaimInput,
  ): Promise<GiofSelfClaimResult> {
    const expectedVersion = toExpectedVersion(String(input.expectedVersion));
    const commandIdentity = JSON.stringify([
      pool,
      input.requestId,
      expectedVersion,
    ]);
    if (inFlightRef.current !== null) {
      throw new Error("Ya hay una toma de trabajo en curso.");
    }

    inFlightRef.current = commandIdentity;
    setPendingRequestId(input.requestId);
    setError(null);
    try {
      const result = await claimGiofWork({
        pool,
        requestId: input.requestId,
        expectedVersion,
      });
      invalidateQueryPrefixes([[QUERY_TAGS.GIOF_WORK, "claimable", pool]]);
      invalidateRequestDomain(input.requestId);
      await refetchPoolQueue({ force: true });
      await refetchClaimable({ force: true });
      return result;
    } catch (reason) {
      if (reason instanceof ApiRequestError && reason.status === 409) {
        invalidateQueryPrefixes([[QUERY_TAGS.GIOF_WORK, "claimable", pool]]);
        invalidateRequestDomain(input.requestId);
        await refetchPoolQueue({ force: true }).catch(() => undefined);
        await refetchClaimable({ force: true }).catch(() => undefined);
      }
      const nextError = new Error(getGiofConflictMessage(reason));
      setError(nextError);
      throw nextError;
    } finally {
      if (inFlightRef.current === commandIdentity) inFlightRef.current = null;
      setPendingRequestId(null);
    }
  }

  return {
    claim,
    pendingRequestId,
    isSubmitting: pendingRequestId !== null,
    error,
    clearError: () => setError(null),
  };
}
