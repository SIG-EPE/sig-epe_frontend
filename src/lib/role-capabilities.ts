import { ROLE_CODE, type RoleCode } from "@/lib/constants";
import type { GiofWorkMetadata } from "@/types/giof-work";

export const ROLE_CAPABILITY = {
  REQUEST_OWN: "request-own",
  REQUEST_HISTORY: "request-history",
  GIOF_REVIEW: "giof-review",
  GIOF_PAYMENT: "giof-payment",
  GIOF_RENDITION: "giof-rendition",
  GIOF_DASHBOARD: "giof-dashboard",
  GIOF_OPERATIONAL_EXECUTE: "giof-operational-execute",
  GIOF_RETRY: "giof-retry",
  GIOF_ASSIGNMENT: "giof-assignment",
  GIOF_MEMBERSHIP_MANAGE: "giof-membership-manage",
  DRIVE_HIERARCHY: "drive-hierarchy",
  DRIVE_HIERARCHY_ADMIN: "drive-hierarchy-admin",
  BUDGET_ADMIN: "budget-admin",
  FINANCIAL_REPORTS: "financial-reports",
  CATALOG_ADMIN: "catalog-admin",
  USER_ADMIN: "user-admin",
  HELP: "help",
} as const;

export type RoleCapability = (typeof ROLE_CAPABILITY)[keyof typeof ROLE_CAPABILITY];

const ROLE_CAPABILITIES: Record<RoleCode, readonly RoleCapability[]> = {
  [ROLE_CODE.SOLICITANTE_EPE]: [ROLE_CAPABILITY.REQUEST_OWN, ROLE_CAPABILITY.HELP],
  [ROLE_CODE.GIOF_GESTOR]: [
    ROLE_CAPABILITY.REQUEST_OWN,
    ROLE_CAPABILITY.REQUEST_HISTORY,
    ROLE_CAPABILITY.GIOF_REVIEW,
    ROLE_CAPABILITY.GIOF_PAYMENT,
    ROLE_CAPABILITY.GIOF_RENDITION,
    ROLE_CAPABILITY.GIOF_DASHBOARD,
    ROLE_CAPABILITY.GIOF_OPERATIONAL_EXECUTE,
    ROLE_CAPABILITY.GIOF_RETRY,
    ROLE_CAPABILITY.HELP,
  ],
  [ROLE_CODE.GIOF_MANAGER]: [
    ROLE_CAPABILITY.REQUEST_OWN,
    ROLE_CAPABILITY.REQUEST_HISTORY,
    ROLE_CAPABILITY.GIOF_REVIEW,
    ROLE_CAPABILITY.GIOF_PAYMENT,
    ROLE_CAPABILITY.GIOF_RENDITION,
    ROLE_CAPABILITY.GIOF_DASHBOARD,
    ROLE_CAPABILITY.GIOF_OPERATIONAL_EXECUTE,
    ROLE_CAPABILITY.GIOF_RETRY,
    ROLE_CAPABILITY.GIOF_ASSIGNMENT,
    ROLE_CAPABILITY.GIOF_MEMBERSHIP_MANAGE,
    ROLE_CAPABILITY.DRIVE_HIERARCHY,
    ROLE_CAPABILITY.DRIVE_HIERARCHY_ADMIN,
    ROLE_CAPABILITY.BUDGET_ADMIN,
    ROLE_CAPABILITY.FINANCIAL_REPORTS,
    ROLE_CAPABILITY.CATALOG_ADMIN,
    ROLE_CAPABILITY.USER_ADMIN,
    ROLE_CAPABILITY.HELP,
  ],
  [ROLE_CODE.AUDITOR_DIRECCION]: [ROLE_CAPABILITY.REQUEST_OWN, ROLE_CAPABILITY.REQUEST_HISTORY, ROLE_CAPABILITY.GIOF_DASHBOARD, ROLE_CAPABILITY.DRIVE_HIERARCHY, ROLE_CAPABILITY.FINANCIAL_REPORTS, ROLE_CAPABILITY.HELP],
  [ROLE_CODE.ADMIN_SISTEMA]: [ROLE_CAPABILITY.REQUEST_OWN, ROLE_CAPABILITY.REQUEST_HISTORY, ROLE_CAPABILITY.GIOF_DASHBOARD, ROLE_CAPABILITY.DRIVE_HIERARCHY, ROLE_CAPABILITY.BUDGET_ADMIN, ROLE_CAPABILITY.FINANCIAL_REPORTS, ROLE_CAPABILITY.CATALOG_ADMIN, ROLE_CAPABILITY.USER_ADMIN, ROLE_CAPABILITY.HELP],
};

export function hasRoleCapability(roleCode: string | null | undefined, capability: RoleCapability): boolean {
  return Boolean(roleCode && roleCode in ROLE_CAPABILITIES && ROLE_CAPABILITIES[roleCode as RoleCode].includes(capability));
}

export function isGiofOperationalRole(roleCode?: string | null): roleCode is RoleCode {
  return hasRoleCapability(roleCode, ROLE_CAPABILITY.GIOF_OPERATIONAL_EXECUTE);
}

export function isGiofManagerRole(roleCode?: string | null): boolean {
  return hasRoleCapability(roleCode, ROLE_CAPABILITY.GIOF_ASSIGNMENT);
}

export function canRetryGiofWork(roleCode?: string | null): boolean {
  return hasRoleCapability(roleCode, ROLE_CAPABILITY.GIOF_RETRY);
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

export function canEditAssignedGiofWork(
  work: GiofWorkMetadata | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  return canOperateAssignedGiofWork(work, currentUserId) && work?.canEdit === true;
}
