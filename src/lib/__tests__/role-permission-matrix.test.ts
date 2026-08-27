import { describe, expect, it } from "vitest";

import { canAccessRoute } from "@/lib/auth/route-access";
import { ROLE_CODE, ROLE_MENU_MAP, type RoleCode } from "@/lib/constants";
import {
  canManageRequestDocuments,
  canReviewRequest,
} from "@/lib/requests";
import {
  ROLE_CAPABILITY,
  canRetryGiofWork,
  hasRoleCapability,
} from "@/lib/role-capabilities";
import { REQUEST_STATUS, REQUEST_TYPE, type PaymentRequest } from "@/types/requests";

const ALL_ROLES = Object.values(ROLE_CODE);

const ROUTE_MATRIX: ReadonlyArray<{
  path: string;
  allowed: readonly RoleCode[];
}> = [
  { path: "/requests", allowed: ALL_ROLES },
  { path: "/requests/new", allowed: ALL_ROLES },
  { path: "/requests/request-1", allowed: ALL_ROLES },
  { path: "/payments", allowed: [ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER] },
  { path: "/renditions", allowed: [ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER] },
  { path: "/dashboard/giof", allowed: [ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER, ROLE_CODE.AUDITOR_DIRECCION, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/management", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.AUDITOR_DIRECCION, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/budget", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.AUDITOR_DIRECCION, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/budget/org-unit-execution", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.AUDITOR_DIRECCION, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/budget/fiscal-years", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/budget/planning", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/budget/planning/new", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/budget/planning/line-1", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/budget/allocations", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/reports", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.AUDITOR_DIRECCION, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/catalogs", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/catalogs/poa-hierarchy", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/admin/users", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/help", allowed: ALL_ROLES },
];

const GESTOR_MENU = [
  "Mis Solicitudes",
  "Bandeja de Revisión",
  "Cola de Pagos",
  "Bandeja de Rendiciones",
  "Dashboard GIOF",
  "Centro de ayuda",
] as const;

const MANAGER_ADMIN_MENU = [
  "Jerarquía de Drive",
  "Presupuesto",
  "Programado vs Ejecutado",
  "Años Fiscales",
  "Plan Operativo (POA)",
  "Aportes de Socios",
  "Reportes",
  "Catálogos",
  "Usuarios",
] as const;

describe("role permission matrix", () => {
  it.each(ROUTE_MATRIX)("enforces direct URL access for $path", ({ path, allowed }) => {
    for (const role of ALL_ROLES) {
      expect(canAccessRoute(path, role).isAllowed, `${role} at ${path}`).toBe(allowed.includes(role));
    }
  });

  it("keeps the Gestor sidebar restricted and gives Manager the administrative superset", () => {
    const gestorLabels = ROLE_MENU_MAP[ROLE_CODE.GIOF_GESTOR].map((item) => item.label);
    const managerLabels = ROLE_MENU_MAP[ROLE_CODE.GIOF_MANAGER].map((item) => item.label);

    expect(gestorLabels).toEqual(GESTOR_MENU);
    expect(managerLabels).toEqual([...GESTOR_MENU.slice(0, 3), "Jerarquía de Drive", ...GESTOR_MENU.slice(3, 5), ...MANAGER_ADMIN_MENU.slice(1), "Centro de ayuda"]);
    for (const label of MANAGER_ADMIN_MENU) {
      expect(gestorLabels).not.toContain(label);
      expect(managerLabels).toContain(label);
    }
  });

  it.each([
    { role: ROLE_CODE.SOLICITANTE_EPE, operational: false, retry: false, assignment: false, membership: false, budgetAdmin: false },
    { role: ROLE_CODE.GIOF_GESTOR, operational: true, retry: true, assignment: false, membership: false, budgetAdmin: false },
    { role: ROLE_CODE.GIOF_MANAGER, operational: true, retry: true, assignment: true, membership: true, budgetAdmin: true },
    { role: ROLE_CODE.AUDITOR_DIRECCION, operational: false, retry: false, assignment: false, membership: false, budgetAdmin: false },
    { role: ROLE_CODE.ADMIN_SISTEMA, operational: false, retry: false, assignment: false, membership: false, budgetAdmin: true },
  ])("enforces named action capabilities for $role", ({ role, operational, retry, assignment, membership, budgetAdmin }) => {
    expect(hasRoleCapability(role, ROLE_CAPABILITY.GIOF_OPERATIONAL_EXECUTE)).toBe(operational);
    expect(canReviewRequest(role, REQUEST_STATUS.SUBMITTED)).toBe(operational);
    expect(canRetryGiofWork(role)).toBe(retry);
    expect(hasRoleCapability(role, ROLE_CAPABILITY.GIOF_ASSIGNMENT)).toBe(assignment);
    expect(hasRoleCapability(role, ROLE_CAPABILITY.GIOF_MEMBERSHIP_MANAGE)).toBe(membership);
    expect(hasRoleCapability(role, ROLE_CAPABILITY.BUDGET_ADMIN)).toBe(budgetAdmin);
  });

  it("keeps operational document actions lease-derived for Gestor and Manager", () => {
    const request = {
      requester_id: "requester-1",
      request_type: REQUEST_TYPE.REIMBURSEMENT,
      giof_work: { canEdit: true },
    } as Pick<PaymentRequest, "requester_id" | "request_type" | "giof_work">;
    const readOnlyRequest = {
      ...request,
      giof_work: { ...request.giof_work!, canEdit: false },
    };

    for (const role of [ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER]) {
      expect(canManageRequestDocuments(role, REQUEST_STATUS.SUBMITTED, request, "operator-1")).toBe(true);
      expect(canManageRequestDocuments(role, REQUEST_STATUS.SUBMITTED, readOnlyRequest, "operator-1")).toBe(false);
    }
    expect(canManageRequestDocuments(ROLE_CODE.SOLICITANTE_EPE, REQUEST_STATUS.SUBMITTED, request, "operator-1")).toBe(false);
  });
});
