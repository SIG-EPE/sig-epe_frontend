import { describe, expect, it } from "vitest";
import { canAccessRoute } from "@/lib/auth/route-access";
import { ROLE_CODE, type RoleCode } from "@/lib/constants";

const ROUTE_MATRIX: ReadonlyArray<{ path: string; allowed: readonly RoleCode[] }> = [
  { path: "/requests", allowed: Object.values(ROLE_CODE) },
  { path: "/payments", allowed: [ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER] },
  { path: "/renditions", allowed: [ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER] },
  { path: "/dashboard/giof", allowed: [ROLE_CODE.GIOF_GESTOR, ROLE_CODE.GIOF_MANAGER, ROLE_CODE.AUDITOR_DIRECCION, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/management", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.AUDITOR_DIRECCION, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/budget", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.AUDITOR_DIRECCION, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/budget/org-unit-execution", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.AUDITOR_DIRECCION, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/budget/fiscal-years", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/budget/planning", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/budget/allocations", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/reports", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.AUDITOR_DIRECCION, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/catalogs", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/admin/users", allowed: [ROLE_CODE.GIOF_MANAGER, ROLE_CODE.ADMIN_SISTEMA] },
  { path: "/help", allowed: Object.values(ROLE_CODE) },
];

describe("route access matrix", () => {
  it.each(ROUTE_MATRIX)("enforces the named capability for $path", ({ path, allowed }) => {
    for (const role of Object.values(ROLE_CODE)) {
      expect(canAccessRoute(path, role).isAllowed, `${role} at ${path}`).toBe(allowed.includes(role));
    }
  });

  it("denies URL tampering", () => {
    expect(canAccessRoute("/unknown-feature", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(false);
    expect(canAccessRoute("/budget/planning/secret", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(false);
    expect(canAccessRoute("/management/nodes/root", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(false);
  });
});
