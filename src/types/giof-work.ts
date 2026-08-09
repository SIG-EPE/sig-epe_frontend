export const GIOF_WORK_POOL = {
  REQUEST: "REQUEST",
  PAYMENT: "PAYMENT",
  REXAN: "REXAN",
} as const;

export type GiofWorkPool = (typeof GIOF_WORK_POOL)[keyof typeof GIOF_WORK_POOL];

export const GIOF_WORK_SCOPE = {
  MINE: "mine",
  ALL: "all",
  UNASSIGNED: "unassigned",
  ASSIGNEE: "assignee",
} as const;

export type GiofWorkScope = (typeof GIOF_WORK_SCOPE)[keyof typeof GIOF_WORK_SCOPE];

export interface GiofWorkLeaseSummary {
  ownerId: string | null;
  heartbeatAt: string | null;
  expiresAt: string | null;
}

export interface GiofWorkMetadata {
  requestId?: string;
  pool: GiofWorkPool;
  assigneeId: string | null;
  assigneeName?: string | null;
  assignmentVersion: string;
  lease: GiofWorkLeaseSummary | null;
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
