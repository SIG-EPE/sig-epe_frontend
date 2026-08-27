import { ROLE_CODE, ROUTES, type RoleCode } from "@/lib/constants";

const REQUEST_REVIEW_ROLES = [ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] as const;
const ALL_REQUEST_ROLES = [
  ROLE_CODE.SOLICITANTE_EPE,
  ROLE_CODE.GIOF_GESTOR,
  ROLE_CODE.GIOF_MANAGER,
  ROLE_CODE.AUDITOR_DIRECCION,
  ROLE_CODE.ADMIN_SISTEMA,
] as const;
const ALL_AUTHENTICATED_ROLES = ALL_REQUEST_ROLES;
const GIOF_ONLY_ROLES = [ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER] as const;
const REQUEST_REVIEW_AND_ADMIN_ROLES = [ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] as const;
const REPORT_ROLES = [ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER, ROLE_CODE.AUDITOR_DIRECCION, ROLE_CODE.ADMIN_SISTEMA] as const;
const DASHBOARD_ROLES = [ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER, ROLE_CODE.AUDITOR_DIRECCION, ROLE_CODE.ADMIN_SISTEMA] as const;
const ADMIN_ONLY_ROLES = [ROLE_CODE.ADMIN_SISTEMA] as const;
const ADMIN_USERS_ROLES = [ROLE_CODE.ADMIN_SISTEMA, ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER] as const;
const CATALOG_MANAGER_ROLES = [ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] as const;
const DRIVE_MANAGEMENT_ROLES = [
  ROLE_CODE.GIOF_MANAGER,
  ROLE_CODE.AUDITOR_DIRECCION,
  ROLE_CODE.ADMIN_SISTEMA,
] as const;

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
  { path: ROUTES.DASHBOARD_GIOF, allowedRoles: DASHBOARD_ROLES, match: "prefix" },
  { path: ROUTES.DASHBOARD, allowedRoles: ALL_AUTHENTICATED_ROLES, match: "exact" },
  { path: ROUTES.PROFILE, allowedRoles: ALL_AUTHENTICATED_ROLES, match: "prefix" },
  { path: ROUTES.HELP_GIOF_ASSIGNMENT, allowedRoles: ALL_AUTHENTICATED_ROLES, match: "exact" },
  { path: ROUTES.HELP, allowedRoles: ALL_AUTHENTICATED_ROLES, match: "prefix" },
  { path: ROUTES.MANAGEMENT, allowedRoles: DRIVE_MANAGEMENT_ROLES, match: "prefix" },
  { path: ROUTES.ADMIN_CONFIG, allowedRoles: ADMIN_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.ADMIN_AUDIT_LOGS, allowedRoles: ADMIN_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.ADMIN_USERS, allowedRoles: ADMIN_USERS_ROLES, match: "prefix" },
  { path: "/admin", allowedRoles: ADMIN_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.REQUESTS_NEW, allowedRoles: ALL_REQUEST_ROLES, match: "exact" },
  { path: `${ROUTES.REQUESTS}/:id/edit`, allowedRoles: ALL_REQUEST_ROLES, match: "request-edit" },
  { path: `${ROUTES.REQUESTS}/`, allowedRoles: ALL_REQUEST_ROLES, match: "prefix" },
  { path: ROUTES.REQUESTS, allowedRoles: ALL_REQUEST_ROLES, match: "exact" },
  { path: ROUTES.PAYMENTS, allowedRoles: GIOF_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.RENDITIONS, allowedRoles: REQUEST_REVIEW_ROLES, match: "prefix" },
  { path: ROUTES.BUDGET_FISCAL_YEARS, allowedRoles: GIOF_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.BUDGET_ALLOCATIONS, allowedRoles: GIOF_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.BUDGET_PLANNING, allowedRoles: GIOF_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.BUDGET_ORG_UNIT_EXECUTION, allowedRoles: DASHBOARD_ROLES, match: "prefix" },
  { path: ROUTES.BUDGET, allowedRoles: DASHBOARD_ROLES, match: "exact" },
  { path: ROUTES.CATALOGS, allowedRoles: CATALOG_MANAGER_ROLES, match: "prefix" },
  { path: ROUTES.ACCOUNTABILITY, allowedRoles: REQUEST_REVIEW_AND_ADMIN_ROLES, match: "prefix" },
  { path: ROUTES.REPORTS, allowedRoles: REPORT_ROLES, match: "prefix" },
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
      isProtectedRoute: true,
      isAllowed: false,
      allowedRoles: null,
    };
  }

  return {
    isProtectedRoute: true,
    isAllowed: Boolean(roleCode && rule.allowedRoles.includes(roleCode as RoleCode)),
    allowedRoles: rule.allowedRoles,
  };
}
