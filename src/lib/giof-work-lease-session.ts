import type { GiofWorkLease, GiofWorkPool } from "@/types/giof-work";

const credentialsByTarget = new Map<string, GiofWorkLease>();
let credentialGeneration = 0;

interface GiofLeaseRequirement {
  requestId: string;
  pool: GiofWorkPool;
  assignmentVersion: string;
  ownerId?: string | null;
}

export function isGiofLeaseCurrent(
  lease: GiofWorkLease | null | undefined,
  requirement: GiofLeaseRequirement,
): lease is GiofWorkLease {
  if (!lease?.token.trim()) return false;
  const expiresAt = Date.parse(lease.expiresAt ?? "");
  return lease.requestId === requirement.requestId
    && lease.pool === requirement.pool
    && lease.assignmentVersion === requirement.assignmentVersion
    && (!requirement.ownerId || lease.ownerId === requirement.ownerId)
    && Number.isFinite(expiresAt)
    && expiresAt > Date.now();
}

export function getGiofLeaseCredentialGeneration(): number {
  return credentialGeneration;
}

export function bindGiofLeaseCredential(
  lease: GiofWorkLease,
  aliases: readonly string[] = [],
  expectedGeneration?: number,
): boolean {
  if (
    expectedGeneration !== undefined &&
    expectedGeneration !== credentialGeneration
  )
    return false;
  credentialsByTarget.set(lease.requestId, lease);
  for (const alias of aliases) {
    if (alias) credentialsByTarget.set(alias, lease);
  }
  return true;
}

export function unbindGiofLeaseCredential(lease: GiofWorkLease): void {
  for (const [target, boundLease] of credentialsByTarget.entries()) {
    if (boundLease.token === lease.token) credentialsByTarget.delete(target);
  }
}

export function getGiofMutationHeaders(path: string, method?: string): HeadersInit | undefined {
  const normalizedMethod = method?.toUpperCase() ?? "GET";
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") return undefined;
  // EXTRA tiene autorización propia por rol/lectura, sin lease financiero ambiental.
  if (
    /^\/requests\/[^/?#]+\/documents\/extra(?:\/[^/?#]+)?(?:[?#].*)?$/.test(path)
  ) return undefined;

  for (const [target, lease] of credentialsByTarget.entries()) {
    if (path.split(/[/?#]/).includes(target)) {
      return {
        "x-giof-assignment-version": lease.assignmentVersion,
        "x-giof-lease-token": lease.token,
      };
    }
  }
  return undefined;
}

export function getGiofLeaseCredential(target: string): GiofWorkLease | undefined {
  return credentialsByTarget.get(target);
}

export function clearGiofLeaseCredentials(): void {
  credentialGeneration += 1;
  credentialsByTarget.clear();
}
