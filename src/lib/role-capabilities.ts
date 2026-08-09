import { ROLE_CODE, type RoleCode } from "@/lib/constants";

export function isGiofOperationalRole(roleCode?: string | null): roleCode is RoleCode {
  return roleCode === ROLE_CODE.GIOF_GESTOR || roleCode === ROLE_CODE.GIOF_MANAGER;
}

export function isGiofManagerRole(roleCode?: string | null): boolean {
  return roleCode === ROLE_CODE.GIOF_MANAGER;
}
