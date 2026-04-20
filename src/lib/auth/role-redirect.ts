// -------------------------------------------------------
// Role → Home Path utility — Edge Runtime compatible
// No React, no Next.js, no Node.js APIs
// -------------------------------------------------------

import { ROUTES } from "@/lib/constants";
import type { RoleCode } from "@/lib/constants";

const ROLE_HOME_PATHS: Record<RoleCode, string> = {
  SOLICITANTE_EPE: ROUTES.REQUESTS,
  PATROCINADOR: ROUTES.DASHBOARD,
  GIOF_GESTOR: ROUTES.MANAGEMENT,
  AUDITOR_DIRECCION: ROUTES.REPORTS,
  ADMIN_SISTEMA: ROUTES.ADMIN_USERS,
};

/**
 * Returns the canonical home route for a given role code.
 * Falls back to ROUTES.DASHBOARD for unknown or undefined roles.
 * Safe for use in Edge Runtime (middleware) and client components.
 */
export function getRoleHomePath(roleCode: string): string {
  return ROLE_HOME_PATHS[roleCode as RoleCode] ?? ROUTES.DASHBOARD;
}
