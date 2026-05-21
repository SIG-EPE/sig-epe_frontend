import { describe, expect, it } from "vitest";

import { canAccessRoute } from "@/lib/auth/route-access";
import { ROLE_CODE } from "@/lib/constants";

describe("route access matrix", () => {
  it("protects payment, budget, and catalog routes for GIOF only", () => {
    expect(canAccessRoute("/payments", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/budget/planning", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/catalogs/funding-sources", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);

    expect(canAccessRoute("/payments", ROLE_CODE.SOLICITANTE_EPE).isAllowed).toBe(false);
    expect(canAccessRoute("/budget/planning", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(false);
    expect(canAccessRoute("/catalogs", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(false);
  });

  it("allows request creation only to requester role", () => {
    expect(canAccessRoute("/requests/new", ROLE_CODE.SOLICITANTE_EPE).isAllowed).toBe(true);
    expect(canAccessRoute("/requests/new", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(false);
    expect(canAccessRoute("/requests/new", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(false);
  });

  it("allows request detail routes to requester and review roles", () => {
    expect(canAccessRoute("/requests/request-1", ROLE_CODE.SOLICITANTE_EPE).isAllowed).toBe(true);
    expect(canAccessRoute("/requests/request-1", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/requests/request-1", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(true);
    expect(canAccessRoute("/requests/request-1", ROLE_CODE.AUDITOR_DIRECCION).isAllowed).toBe(false);
  });

  it("allows request edit routes only to requester role", () => {
    expect(canAccessRoute("/requests/request-1/edit", ROLE_CODE.SOLICITANTE_EPE).isAllowed).toBe(true);
    expect(canAccessRoute("/requests/request-1/edit", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(false);
    expect(canAccessRoute("/requests/request-1/edit", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(false);
  });

  it("keeps admin sub-routes role-specific", () => {
    expect(canAccessRoute("/admin/users", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/admin/config", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(false);
    expect(canAccessRoute("/admin/audit-logs", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(true);
  });
});
