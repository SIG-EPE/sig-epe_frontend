import { ROLE_CODE, type RoleCode } from "@/lib/constants";
import type { GiofWorkMetadata } from "@/types/giof-work";

export function isGiofOperationalRole(roleCode?: string | null): roleCode is RoleCode {
  return roleCode === ROLE_CODE.GIOF_GESTOR || roleCode === ROLE_CODE.GIOF_MANAGER;
}

export function isGiofManagerRole(roleCode?: string | null): boolean {
  return roleCode === ROLE_CODE.GIOF_MANAGER;
}

export function canRetryGiofWork(roleCode?: string | null): boolean {
  return isGiofOperationalRole(roleCode);
}

export function canOperateAssignedGiofWork(
  work: GiofWorkMetadata | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  return Boolean(
    currentUserId
      && work?.assigneeId === currentUserId
      && work.canAcquire === true,
  );
}
