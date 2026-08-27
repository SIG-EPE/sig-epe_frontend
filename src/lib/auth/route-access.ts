import { ROLE_CODE, ROUTES, type RoleCode } from "@/lib/constants";
import { ROLE_CAPABILITY, hasRoleCapability, type RoleCapability } from "@/lib/role-capabilities";

const ALL_AUTHENTICATED_ROLES = Object.values(ROLE_CODE);
const ADMIN_ONLY_ROLES = [ROLE_CODE.ADMIN_SISTEMA] as const;

interface RouteAccessRule {
  path: string;
  capability?: RoleCapability;
  allowedRoles?: readonly RoleCode[];
  match: "exact" | "prefix" | "request-edit";
}

export interface RouteAccessDecision {
  isProtectedRoute: boolean;
  isAllowed: boolean;
  allowedRoles: readonly RoleCode[] | null;
}

export const ROUTE_ACCESS_RULES = [
  { path: ROUTES.DASHBOARD_GIOF, capability: ROLE_CAPABILITY.GIOF_DASHBOARD, match: "prefix" },
  { path: ROUTES.DASHBOARD, capability: ROLE_CAPABILITY.REQUEST_OWN, match: "exact" },
  { path: ROUTES.PROFILE, allowedRoles: ALL_AUTHENTICATED_ROLES, match: "prefix" },
  { path: ROUTES.HELP_GIOF_ASSIGNMENT, capability: ROLE_CAPABILITY.HELP, match: "exact" },
  { path: ROUTES.HELP, capability: ROLE_CAPABILITY.HELP, match: "prefix" },
  { path: ROUTES.MANAGEMENT, capability: ROLE_CAPABILITY.DRIVE_HIERARCHY, match: "prefix" },
  { path: ROUTES.ADMIN_CONFIG, allowedRoles: ADMIN_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.ADMIN_AUDIT_LOGS, allowedRoles: ADMIN_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.ADMIN_USERS, capability: ROLE_CAPABILITY.USER_ADMIN, match: "prefix" },
  { path: "/admin", allowedRoles: ADMIN_ONLY_ROLES, match: "prefix" },
  { path: ROUTES.REQUESTS_NEW, capability: ROLE_CAPABILITY.REQUEST_OWN, match: "exact" },
  { path: `${ROUTES.REQUESTS}/:id/edit`, capability: ROLE_CAPABILITY.REQUEST_OWN, match: "request-edit" },
  { path: `${ROUTES.REQUESTS}/`, capability: ROLE_CAPABILITY.REQUEST_OWN, match: "prefix" },
  { path: ROUTES.REQUESTS, capability: ROLE_CAPABILITY.REQUEST_OWN, match: "exact" },
  { path: ROUTES.PAYMENTS, capability: ROLE_CAPABILITY.GIOF_PAYMENT, match: "prefix" },
  { path: ROUTES.RENDITIONS, capability: ROLE_CAPABILITY.GIOF_RENDITION, match: "prefix" },
  { path: ROUTES.BUDGET_FISCAL_YEARS, capability: ROLE_CAPABILITY.BUDGET_ADMIN, match: "prefix" },
  { path: ROUTES.BUDGET_ALLOCATIONS, capability: ROLE_CAPABILITY.BUDGET_ADMIN, match: "prefix" },
  { path: ROUTES.BUDGET_PLANNING, capability: ROLE_CAPABILITY.BUDGET_ADMIN, match: "prefix" },
  { path: ROUTES.BUDGET_ORG_UNIT_EXECUTION, capability: ROLE_CAPABILITY.FINANCIAL_REPORTS, match: "prefix" },
  { path: ROUTES.BUDGET, capability: ROLE_CAPABILITY.FINANCIAL_REPORTS, match: "exact" },
  { path: ROUTES.CATALOGS, capability: ROLE_CAPABILITY.CATALOG_ADMIN, match: "prefix" },
  { path: ROUTES.ACCOUNTABILITY, capability: ROLE_CAPABILITY.GIOF_RENDITION, match: "prefix" },
  { path: ROUTES.REPORTS, capability: ROLE_CAPABILITY.FINANCIAL_REPORTS, match: "prefix" },
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
  if (!rule) return { isProtectedRoute: true, isAllowed: false, allowedRoles: null };

  const isAllowed = Boolean(roleCode && (rule.capability
    ? hasRoleCapability(roleCode, rule.capability)
    : rule.allowedRoles?.includes(roleCode as RoleCode)));
  return { isProtectedRoute: true, isAllowed, allowedRoles: rule.allowedRoles ?? null };
}
