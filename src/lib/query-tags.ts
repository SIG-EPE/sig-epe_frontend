import { invalidateQueryPrefix, invalidateQueryTag } from "@/lib/query-cache";

export const QUERY_TAGS = {
  REQUESTS: "requests",
  BUDGET: "budget",
  PAYMENTS: "payments",
  RENDITIONS: "renditions",
  CATALOGS: "catalogs",
  CATALOG: "catalog",
  USERS: "users",
  AUDIT: "audit",
  DASHBOARD: "dashboard",
  DASHBOARD_OPTIONS: "dashboard-options",
  POA: "poa",
  GIOF_WORK: "giof-work",
} as const;

export type QueryTag = (typeof QUERY_TAGS)[keyof typeof QUERY_TAGS];

export function invalidateDomainTags(tags: readonly QueryTag[]): void {
  for (const tag of tags) {
    invalidateQueryTag(tag);
  }
}

export function invalidateQueryPrefixes(prefixes: readonly (readonly unknown[])[]): void {
  for (const prefix of prefixes) {
    invalidateQueryPrefix(prefix);
  }
}

export function invalidateRequestDomain(requestId?: string): void {
  invalidateDomainTags([
    QUERY_TAGS.REQUESTS,
    QUERY_TAGS.PAYMENTS,
    QUERY_TAGS.RENDITIONS,
    QUERY_TAGS.DASHBOARD,
    QUERY_TAGS.BUDGET,
    QUERY_TAGS.POA,
    QUERY_TAGS.GIOF_WORK,
  ]);
  if (requestId) invalidateQueryPrefixes([["requests", "detail", requestId]]);
}

export function invalidateCatalogDomain(): void {
  invalidateDomainTags([
    QUERY_TAGS.CATALOGS,
    QUERY_TAGS.CATALOG,
    QUERY_TAGS.BUDGET,
    QUERY_TAGS.POA,
    QUERY_TAGS.DASHBOARD_OPTIONS,
  ]);
}

export function invalidateUserDomain(): void {
  invalidateDomainTags([QUERY_TAGS.USERS, QUERY_TAGS.DASHBOARD]);
}
