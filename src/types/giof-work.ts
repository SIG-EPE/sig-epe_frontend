import type { RequestStatus, RequestType } from "@/types/requests";

export const GIOF_WORK_POOL = {
  REQUEST: "REQUEST",
  PAYMENT: "PAYMENT",
  REXAN: "REXAN",
} as const;

export type GiofWorkPool = (typeof GIOF_WORK_POOL)[keyof typeof GIOF_WORK_POOL];

export const GIOF_CLAIMABLE_ASSIGNMENT_STATE = {
  UNASSIGNED: "UNASSIGNED",
  TAKEOVER: "TAKEOVER",
} as const;

export type GiofClaimableAssignmentState =
  (typeof GIOF_CLAIMABLE_ASSIGNMENT_STATE)[keyof typeof GIOF_CLAIMABLE_ASSIGNMENT_STATE];

export const GIOF_CLAIMABLE_LEASE_STATE = {
  NONE: "NONE",
  OWN_ACTIVE: "OWN_ACTIVE",
  EXPIRED: "EXPIRED",
  STALE: "STALE",
} as const;

export type GiofClaimableLeaseState =
  (typeof GIOF_CLAIMABLE_LEASE_STATE)[keyof typeof GIOF_CLAIMABLE_LEASE_STATE];

export interface GiofSelfClaimCommand {
  pool: GiofWorkPool;
  requestId: string;
  expectedVersion: number;
}

export interface GiofSelfClaimResult {
  requestId: string;
  pool: GiofWorkPool;
  assignmentVersion: string;
  changed: boolean;
}

export interface GiofClaimableWorkItem {
  requestId: string;
  requestCode: string | null;
  pool: GiofWorkPool;
  requestType: RequestType;
  status: RequestStatus;
  queueDate: string;
  assignmentVersion: string;
  assignmentState: GiofClaimableAssignmentState;
  leaseState: GiofClaimableLeaseState;
}

export interface GiofClaimableWorkPage {
  items: GiofClaimableWorkItem[];
  total: number;
  page: number;
  limit: number;
}

export const GIOF_WORK_SCOPE = {
  MINE: "mine",
  ALL: "all",
  UNASSIGNED: "unassigned",
  ASSIGNEE: "assignee",
} as const;

export type GiofWorkScope =
  (typeof GIOF_WORK_SCOPE)[keyof typeof GIOF_WORK_SCOPE];

export const GIOF_WORK_ASSIGNMENT_STATE = {
  UNASSIGNED: "UNASSIGNED",
  SELF: "SELF",
  OTHER: "OTHER",
} as const;

export type GiofWorkAssignmentState =
  (typeof GIOF_WORK_ASSIGNMENT_STATE)[keyof typeof GIOF_WORK_ASSIGNMENT_STATE];

export const GIOF_WORK_LEASE_STATE = {
  NONE: "NONE",
  ACTIVE_SELF: "ACTIVE_SELF",
  ACTIVE_OTHER: "ACTIVE_OTHER",
  EXPIRED: "EXPIRED",
  STALE: "STALE",
} as const;

export type GiofWorkLeaseState =
  (typeof GIOF_WORK_LEASE_STATE)[keyof typeof GIOF_WORK_LEASE_STATE];

export interface GiofWorkLeaseSummary {
  pool?: GiofWorkPool;
  ownerId: string | null;
  heartbeatAt: string | null;
  expiresAt: string | null;
}

export interface GiofWorkMetadata {
  requestId?: string;
  pool: GiofWorkPool;
  assignmentState?: GiofWorkAssignmentState;
  assigneeId?: string | null;
  assigneeName?: string | null;
  assignmentVersion: string;
  leaseState?: GiofWorkLeaseState;
  lease?: GiofWorkLeaseSummary | null;
  canAssign?: boolean;
  canAcquire: boolean;
  canEdit: boolean;
  readOnly: boolean;
}

export interface GiofLeaseCommand {
  pool: GiofWorkPool;
  requestId: string;
  expectedVersion: number;
  token?: string;
}

export interface GiofWorkLease extends GiofWorkLeaseSummary {
  pool: GiofWorkPool;
  requestId: string;
  ownerId: string;
  token: string;
  assignmentVersion: string;
  ttlSeconds: number;
  heartbeatIntervalSeconds: number;
}

export interface GiofAssignmentItem {
  requestId: string;
  expectedAssigneeId: string | null;
  expectedVersion: number;
}

export interface GiofBulkAssignInput {
  pool: GiofWorkPool;
  items: GiofAssignmentItem[];
  targetAssigneeId: string;
  note?: string;
}

export interface GiofBulkAssignResponse {
  batchId: string;
  changed: number;
  unchanged: number;
}

export const GIOF_BULK_ASSIGNMENT_MODE = {
  MANAGER_TARGET: "MANAGER_TARGET",
  GESTOR_SELF: "GESTOR_SELF",
} as const;

export type GiofBulkAssignmentMode =
  (typeof GIOF_BULK_ASSIGNMENT_MODE)[keyof typeof GIOF_BULK_ASSIGNMENT_MODE];

export const SELF_BULK_ASSIGNMENT_OUTCOME = {
  ASSIGNED: "ASSIGNED",
  UNCHANGED_SELF: "UNCHANGED_SELF",
  BLOCKED: "BLOCKED",
} as const;

export type GiofSelfBulkAssignmentOutcome =
  (typeof SELF_BULK_ASSIGNMENT_OUTCOME)[keyof typeof SELF_BULK_ASSIGNMENT_OUTCOME];

export const SELF_BULK_ASSIGNMENT_BLOCK_CODE = {
  NOT_FOUND_OR_POOL_MISMATCH: "NOT_FOUND_OR_POOL_MISMATCH",
  INELIGIBLE_LIFECYCLE: "INELIGIBLE_LIFECYCLE",
  VERSION_CONFLICT: "VERSION_CONFLICT",
  ACTIVE_FOREIGN_LEASE: "ACTIVE_FOREIGN_LEASE",
} as const;

export type GiofSelfBulkAssignmentBlockCode =
  (typeof SELF_BULK_ASSIGNMENT_BLOCK_CODE)[keyof typeof SELF_BULK_ASSIGNMENT_BLOCK_CODE];

export interface GiofSelfBulkAssignmentItem {
  requestId: string;
  expectedAssignmentVersion: number;
}

export interface GiofSelfBulkAssignInput {
  pool: GiofWorkPool;
  items: GiofSelfBulkAssignmentItem[];
}

export interface GiofSelfBulkAssignmentResult {
  requestId: string;
  outcome: GiofSelfBulkAssignmentOutcome;
  code?: GiofSelfBulkAssignmentBlockCode;
  assignmentVersion?: string;
}

export interface GiofSelfBulkAssignmentCounts {
  assigned: number;
  unchangedSelf: number;
  blocked: number;
}

export interface GiofSelfBulkAssignResponse {
  pool: GiofWorkPool;
  total: number;
  counts: GiofSelfBulkAssignmentCounts;
  results: GiofSelfBulkAssignmentResult[];
}

export interface GiofReleaseWorkCommand {
  requestId: string;
  pool: GiofWorkPool;
  expectedAssignmentVersion: number;
}

export interface GiofForceReassignWorkCommand extends GiofReleaseWorkCommand {
  targetAssigneeId: string;
  reason: string;
  confirmed: true;
  acknowledgePaymentInterruption?: true;
}

export interface GiofOwnershipCommandResult {
  requestId: string;
  pool: GiofWorkPool;
  assignmentVersion: string;
  changed: boolean;
}

export const GIOF_OWNERSHIP_ERROR_CODE = {
  NOT_FOUND: "NOT_FOUND",
  INELIGIBLE_LIFECYCLE: "INELIGIBLE_LIFECYCLE",
  ASSIGNEE_MISMATCH: "ASSIGNEE_MISMATCH",
  VERSION_MISMATCH: "VERSION_MISMATCH",
  ACTIVE_FOREIGN_LEASE: "ACTIVE_FOREIGN_LEASE",
  ACTIVE_CROSS_POOL_LEASE: "ACTIVE_CROSS_POOL_LEASE",
} as const;

export type GiofOwnershipErrorCode =
  (typeof GIOF_OWNERSHIP_ERROR_CODE)[keyof typeof GIOF_OWNERSHIP_ERROR_CODE];

export interface GiofAssignmentBlocker {
  requestId: string;
  requestCode?: string | null;
  reason: string;
  currentAssigneeId?: string | null;
  currentVersion?: string;
  currentStatus?: string;
  leaseExpiresAt?: string;
}

export interface GiofAssigneeCandidate {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface GiofAssignmentHistoryUser {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
}

export interface GiofAssignmentHistoryItem {
  id: string;
  request_id: string;
  pool: GiofWorkPool;
  event_type: string;
  from_assignee_id: string | null;
  to_assignee_id: string;
  assignment_version: string;
  actor_id: string | null;
  batch_id: string;
  note: string | null;
  occurred_at: string;
  created_at: string;
  fromAssignee?: GiofAssignmentHistoryUser | null;
  toAssignee?: GiofAssignmentHistoryUser | null;
  actor?: GiofAssignmentHistoryUser | null;
}
