import type { GiofWorkLease } from "@/types/giof-work";

const credentialsByTarget = new Map<string, GiofWorkLease>();

export function bindGiofLeaseCredential(lease: GiofWorkLease, aliases: readonly string[] = []): void {
  credentialsByTarget.set(lease.requestId, lease);
  for (const alias of aliases) {
    if (alias) credentialsByTarget.set(alias, lease);
  }
}

export function unbindGiofLeaseCredential(lease: GiofWorkLease): void {
  for (const [target, boundLease] of credentialsByTarget.entries()) {
    if (boundLease.token === lease.token) credentialsByTarget.delete(target);
  }
}

export function getGiofMutationHeaders(path: string, method?: string): HeadersInit | undefined {
  const normalizedMethod = method?.toUpperCase() ?? "GET";
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD") return undefined;

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
