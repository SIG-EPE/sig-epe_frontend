import { ROLE_CODE, ROUTES, type RoleCode } from "@/lib/constants";

const REQUEST_REVIEW_ROLES = [ROLE_CODE.GIOF_GESTOR, ROLE_CODE.ADMIN_SISTEMA] as const;
const REQUEST_DETAIL_ROLES = [
  ROLE_CODE.SOLICITANTE_EPE,
  ROLE_CODE.GIOF_GESTOR,
  ROLE_CODE.ADMIN_SISTEMA,
] as const;
const GIOF_ONLY_ROLES = [ROLE_CODE.GIOF_GESTOR] as const;
const ADMIN_ONLY_ROLES = [ROLE_CODE.ADMIN_SISTEMA] as const;
const ADMIN_USERS_ROLES = [ROLE_CODE.ADMIN_SISTEMA, ROLE_CODE.GIOF_GESTOR] as const;

interface RouteAccessRule {
  path: string;
  allowedRoles: readonly RoleCode[];
  match: "exact" | "prefix" | "request-edit";
}

export interface RouteAccessDecision {
  isProtectedRoute: boolean;
  isAllowed: boolean;
  allowedRoles: readonly RoleCode[] | null;
}

export const ROUTE_ACCESS_RULES = [
  { path: ROUTES.ADMIN_CONFIG, allowedRoles: ADMIN_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.ADMIN_AUDIT_LOGS, allowedRoles: ADMIN_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.ADMIN_USERS, allowedRoles: ADMIN_USERS_ROLES, match: "prefix" },
  { path: "/admin", allowedRoles: ADMIN_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.REQUESTS_NEW, allowedRoles: [ROLE_CODE.SOLICITANTE_EPE], match: "exact" },
  { path: `${ROUTES.REQUESTS}/:id/edit`, allowedRoles: [ROLE_CODE.SOLICITANTE_EPE], match: "request-edit" },
  { path: `${ROUTES.REQUESTS}/`, allowedRoles: REQUEST_DETAIL_ROLES, match: "prefix" },
  { path: ROUTES.REQUESTS, allowedRoles: REQUEST_DETAIL_ROLES, match: "exact" },
  { path: ROUTES.PAYMENTS, allowedRoles: GIOF_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.RENDITIONS, allowedRoles: REQUEST_REVIEW_ROLES, match: "prefix" },
  { path: ROUTES.BUDGET, allowedRoles: GIOF_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.CATALOGS, allowedRoles: GIOF_ONLY_ROLES, match: "prefix" },
] as const satisfies readonly RouteAccessRule[];

function matchesRouteRule(pathname: string, rule: RouteAccessRule): boolean {
  if (rule.match === "exact") return pathname === rule.path;
  if (rule.match === "request-edit") return /^\/requests\/[^/]+\/edit$/.test(pathname);

  return pathname === rule.path || pathname.startsWith(rule.path.endsWith("/") ? rule.path : `${rule.path}/`);
}

export function getRouteAccessRule(pathname: string): RouteAccessRule | null {
  return ROUTE_ACCESS_RULES.find((rule) => matchesRouteRule(pathname, rule)) ?? null;
}

export function canAccessRoute(pathname: string, roleCode: string | null | undefined): RouteAccessDecision {
  const rule = getRouteAccessRule(pathname);

  if (!rule) {
    return {
      isProtectedRoute: false,
      isAllowed: true,
      allowedRoles: null,
    };
  }

  return {
    isProtectedRoute: true,
    isAllowed: Boolean(roleCode && rule.allowedRoles.includes(roleCode as RoleCode)),
    allowedRoles: rule.allowedRoles,
  };
}
