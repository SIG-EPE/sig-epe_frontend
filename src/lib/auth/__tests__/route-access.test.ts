import { describe, expect, it } from "vitest";

import { canAccessRoute } from "@/lib/auth/route-access";
import { ROLE_CODE } from "@/lib/constants";

describe("route access matrix", () => {
  it("protects payment and budget management for GIOF, while catalogs align GIOF/Admin", () => {
    expect(canAccessRoute("/payments", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/budget/planning", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/catalogs/funding-sources", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);

    expect(canAccessRoute("/payments", ROLE_CODE.SOLICITANTE_EPE).isAllowed).toBe(false);
    expect(canAccessRoute("/budget/planning", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(false);
    expect(canAccessRoute("/catalogs", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(true);
    expect(canAccessRoute("/catalogs/poa-hierarchy", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(true);
    expect(canAccessRoute("/catalogs/poa-hierarchy", ROLE_CODE.AUDITOR_DIRECCION).isAllowed).toBe(false);
  });

  it("allows restricted dashboards to GIOF, Admin and Auditor while denying Solicitante", () => {
    expect(canAccessRoute("/budget", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/budget", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(true);
    expect(canAccessRoute("/budget", ROLE_CODE.AUDITOR_DIRECCION).isAllowed).toBe(true);
    expect(canAccessRoute("/budget", ROLE_CODE.SOLICITANTE_EPE).isAllowed).toBe(false);

    expect(canAccessRoute("/budget/org-unit-execution", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/budget/org-unit-execution", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(true);
    expect(canAccessRoute("/budget/org-unit-execution", ROLE_CODE.AUDITOR_DIRECCION).isAllowed).toBe(true);
    expect(canAccessRoute("/budget/org-unit-execution", ROLE_CODE.SOLICITANTE_EPE).isAllowed).toBe(false);

    expect(canAccessRoute("/dashboard/giof", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/dashboard/giof", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(true);
    expect(canAccessRoute("/dashboard/giof", ROLE_CODE.AUDITOR_DIRECCION).isAllowed).toBe(true);
    expect(canAccessRoute("/dashboard/giof", ROLE_CODE.SOLICITANTE_EPE).isAllowed).toBe(false);
  });

  it("allows request creation to every authenticated role", () => {
    expect(canAccessRoute("/requests/new", ROLE_CODE.SOLICITANTE_EPE).isAllowed).toBe(true);
    expect(canAccessRoute("/requests/new", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/requests/new", ROLE_CODE.AUDITOR_DIRECCION).isAllowed).toBe(true);
    expect(canAccessRoute("/requests/new", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(true);
  });

  it("allows request detail routes to every authenticated role", () => {
    expect(canAccessRoute("/requests/request-1", ROLE_CODE.SOLICITANTE_EPE).isAllowed).toBe(true);
    expect(canAccessRoute("/requests/request-1", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/requests/request-1", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(true);
    expect(canAccessRoute("/requests/request-1", ROLE_CODE.AUDITOR_DIRECCION).isAllowed).toBe(true);
  });

  it("allows request edit routes to every authenticated role", () => {
    expect(canAccessRoute("/requests/request-1/edit", ROLE_CODE.SOLICITANTE_EPE).isAllowed).toBe(true);
    expect(canAccessRoute("/requests/request-1/edit", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/requests/request-1/edit", ROLE_CODE.AUDITOR_DIRECCION).isAllowed).toBe(true);
    expect(canAccessRoute("/requests/request-1/edit", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(true);
  });

  it("keeps admin sub-routes role-specific", () => {
    expect(canAccessRoute("/admin/users", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/admin/config", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(false);
    expect(canAccessRoute("/admin/audit-logs", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(true);
  });

  it("allows shared authenticated pages explicitly", () => {
    expect(canAccessRoute("/dashboard", ROLE_CODE.SOLICITANTE_EPE).isAllowed).toBe(true);
    expect(canAccessRoute("/profile", ROLE_CODE.AUDITOR_DIRECCION).isAllowed).toBe(true);
    expect(canAccessRoute("/management", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(true);
  });

  it("allows the help center to every authenticated role and no missing role", () => {
    expect(canAccessRoute("/help", ROLE_CODE.SOLICITANTE_EPE).isAllowed).toBe(true);
    expect(canAccessRoute("/help", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/help", ROLE_CODE.AUDITOR_DIRECCION).isAllowed).toBe(true);
    expect(canAccessRoute("/help", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(true);
    expect(canAccessRoute("/help", null).isAllowed).toBe(false);
  });

  it("keeps report and accountability pages limited to review/admin roles", () => {
    expect(canAccessRoute("/reports", ROLE_CODE.GIOF_GESTOR).isAllowed).toBe(true);
    expect(canAccessRoute("/reports", ROLE_CODE.AUDITOR_DIRECCION).isAllowed).toBe(true);
    expect(canAccessRoute("/accountability", ROLE_CODE.ADMIN_SISTEMA).isAllowed).toBe(true);
    expect(canAccessRoute("/reports", ROLE_CODE.SOLICITANTE_EPE).isAllowed).toBe(false);
    expect(canAccessRoute("/accountability", ROLE_CODE.AUDITOR_DIRECCION).isAllowed).toBe(false);
  });

  it("denies authenticated app routes that do not have an explicit rule", () => {
    const decision = canAccessRoute("/unknown-feature", ROLE_CODE.ADMIN_SISTEMA);

    expect(decision.isProtectedRoute).toBe(true);
    expect(decision.isAllowed).toBe(false);
  });
});
