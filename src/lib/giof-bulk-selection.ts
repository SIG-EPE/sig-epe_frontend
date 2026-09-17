import {
  GIOF_BULK_ASSIGNMENT_MODE,
  GIOF_WORK_ASSIGNMENT_STATE,
  GIOF_WORK_LEASE_STATE,
  type GiofBulkAssignmentMode,
  type GiofWorkMetadata,
} from "@/types/giof-work";

export const GIOF_BULK_SELECTION_MAX = 50;

export interface GiofBulkSelectableWorkItem {
  requestId: string;
  label: string;
  work: GiofWorkMetadata;
}

function hasValidAssignmentVersion(version: string): boolean {
  const parsed = Number(version);
  return version.trim() !== "" && Number.isSafeInteger(parsed) && parsed >= 0;
}

export function isGiofBulkSelectable(
  work: GiofWorkMetadata,
  mode: GiofBulkAssignmentMode,
): boolean {
  if (work.canAssign !== true) return false;
  if (mode === GIOF_BULK_ASSIGNMENT_MODE.MANAGER_TARGET) return true;

  const assignmentEligible =
    work.assignmentState === GIOF_WORK_ASSIGNMENT_STATE.UNASSIGNED ||
    work.assignmentState === GIOF_WORK_ASSIGNMENT_STATE.OTHER;
  const leaseEligible =
    work.leaseState === GIOF_WORK_LEASE_STATE.NONE ||
    work.leaseState === GIOF_WORK_LEASE_STATE.EXPIRED ||
    work.leaseState === GIOF_WORK_LEASE_STATE.STALE;
  return (
    assignmentEligible &&
    leaseEligible &&
    hasValidAssignmentVersion(work.assignmentVersion)
  );
}

export function getGiofCurrentPageSelection(
  currentPageItems: readonly GiofBulkSelectableWorkItem[],
  selectedIds: readonly string[],
  mode: GiofBulkAssignmentMode,
): GiofBulkSelectableWorkItem[] {
  const selected = new Set(selectedIds);
  return currentPageItems
    .filter(
      (item) =>
        selected.has(item.requestId) && isGiofBulkSelectable(item.work, mode),
    )
    .slice(0, GIOF_BULK_SELECTION_MAX);
}
