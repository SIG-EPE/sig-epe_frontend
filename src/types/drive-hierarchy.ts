export const DRIVE_HIERARCHY_LIFECYCLE = {
  PREPARING: "PREPARING",
  READY: "READY",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  RECOVERY: "RECOVERY",
  BLOCKED: "BLOCKED",
  RETIRED: "RETIRED",
} as const;

export type DriveHierarchyLifecycle =
  (typeof DRIVE_HIERARCHY_LIFECYCLE)[keyof typeof DRIVE_HIERARCHY_LIFECYCLE];

export interface DriveHierarchyNode {
  id: string;
  parent_id: string | null;
  node_kind: string;
  lifecycle_status: DriveHierarchyLifecycle;
  logical_key: string;
  name: string;
  drive_folder_id: string | null;
  version: number;
  last_error_code: string | null;
  last_error_message: string | null;
  last_error_at: string | null;
}

export interface DriveHierarchyRootStatus {
  registered: boolean;
  legacyBehavior: boolean;
  configuredRootId?: string;
  configuredSharedDriveId?: string;
  message?: string;
  root: DriveHierarchyNode | null;
}

export interface DrivePaymentProjectionCounts {
  SOURCE_REQUIRED: number;
  PENDING: number;
  PROCESSING: number;
  SUCCEEDED: number;
  FAILED: number;
}

export interface DrivePaymentProjectionHealthError {
  paymentId: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  completedAt: string | null;
  errorCode: string;
  errorMessage: string | null;
  phase: string | null;
  reconciliationRequired: boolean;
  frozen: boolean;
}

export interface DriveProjectionWorkerProcessError {
  code: string;
  message: string;
}

export interface DriveProjectionWorkerProcess {
  lastTickAt: string | null;
  lastCompletedAt: string | null;
  lastError: DriveProjectionWorkerProcessError | null;
  lastBatchClaimed: number;
  lastBatchProcessed: number;
  lastSkipReasons?: string[] | null;
  lastClaimableCount?: number | null;
  inFlight: boolean;
}

export const DRIVE_PROJECTION_ACTIVATION_MODE = {
  OWNER_CUTOVER: "OWNER_CUTOVER",
  STANDARD_ACTIVATION: "STANDARD_ACTIVATION",
} as const;

export type DriveProjectionActivationMode =
  (typeof DRIVE_PROJECTION_ACTIVATION_MODE)[keyof typeof DRIVE_PROJECTION_ACTIVATION_MODE];

export interface DriveProjectionRuntimeDurableActivation {
  present: boolean;
  mode: DriveProjectionActivationMode | null;
  approvalReference: string | null;
}

export interface DriveProjectionRuntimeRenewableHealth {
  fresh: boolean;
  requiredGates: string[];
  presentGates: string[];
}

export interface DriveProjectionRuntimeAuthorization {
  active: boolean;
  reasons: string[];
  durableActivation: DriveProjectionRuntimeDurableActivation;
  renewableHealth: DriveProjectionRuntimeRenewableHealth;
  readinessFreezeActive: boolean;
  schemaReady: boolean;
  automaticAdmission: DriveProjectionAutomaticAdmission;
}

export interface DriveProjectionAutomaticAdmission {
  fresh: boolean;
  generation: number | null;
  observedAt: string | null;
  expiresAt: string | null;
}

export const DRIVE_PROJECTION_AUDITOR_STATUS = {
  PASS: "PASS",
  FAIL: "FAIL",
  STALE: "STALE",
  MISSING: "MISSING",
} as const;

export type DriveProjectionAuditorStatus =
  (typeof DRIVE_PROJECTION_AUDITOR_STATUS)[keyof typeof DRIVE_PROJECTION_AUDITOR_STATUS];

export interface DriveProjectionAuditorHealth {
  status: DriveProjectionAuditorStatus;
  generation: number | null;
  rootRevision: string | null;
  observedAt: string | null;
  expiresAt: string | null;
  ageSeconds: number | null;
  issueCodes: string[];
  auditedCount: number;
  frozenCount: number;
  wireAttempts: number;
}

export interface DriveProjectionCallBudget {
  normal: 1;
  maximum: 2;
  lastBatchMaximum: number;
}

export interface DrivePaymentProjectionHealth {
  workerEnabled: boolean;
  cronExpression?: string | null;
  workerProcess?: DriveProjectionWorkerProcess | null;
  writerInstanceId: string;
  dailyRoutingCutoverAt: string | null;
  maxFutureLeadSeconds: number | null;
  routePolicyVersion: string | null;
  routeClassificationSemantics: string | null;
  routeDateSemantics: string | null;
  routePolicyFingerprint: string | null;
  lifecycleStatus: DriveHierarchyLifecycle | null;
  active: boolean;
  authorization: DriveProjectionRuntimeAuthorization;
  operationalReasons: string[];
  counts: DrivePaymentProjectionCounts;
  eligibleCount: number;
  dueCount: number;
  oldestEligibleAt: string | null;
  oldestEligibleLagSeconds: number | null;
  oldestDueAt: string | null;
  errors: DrivePaymentProjectionHealthError[];
  auditor: DriveProjectionAuditorHealth | null;
  callBudget: DriveProjectionCallBudget;
}

export const DRIVE_RUNTIME_GATE = {
  LIVE_PREFLIGHT: "LIVE_PREFLIGHT",
  ACL_DRIFT_SCAN: "ACL_DRIFT_SCAN",
} as const;

export type DriveRuntimeGate =
  (typeof DRIVE_RUNTIME_GATE)[keyof typeof DRIVE_RUNTIME_GATE];

export const DRIVE_GATE_EVIDENCE_RESULT_STATUS = {
  PASS: "PASS",
  FAIL: "FAIL",
} as const;

export type DriveGateEvidenceResultStatus =
  (typeof DRIVE_GATE_EVIDENCE_RESULT_STATUS)[keyof typeof DRIVE_GATE_EVIDENCE_RESULT_STATUS];

export interface ProduceDriveGateEvidenceInput {
  gate: DriveRuntimeGate;
  approvalReference: string;
  supersedesEvidenceId: string;
}

export interface DriveGateEvidenceResult {
  status: DriveGateEvidenceResultStatus;
}

export interface RetryDrivePaymentProjectionInput {
  reason: string;
}

export const DRIVE_TOPOLOGY_CLEANUP_OUTCOME = {
  TRASHED: "TRASHED",
  PRESERVED_BLOCKED: "PRESERVED_BLOCKED",
} as const;

export type DriveTopologyCleanupOutcome =
  (typeof DRIVE_TOPOLOGY_CLEANUP_OUTCOME)[keyof typeof DRIVE_TOPOLOGY_CLEANUP_OUTCOME];

export interface ReconcileCurrentPaymentDailyTopologyInput {
  reason: string;
  approvalReference: string;
  cleanupResidues: boolean;
  cleanupApprovalReference?: string;
}

export interface DrivePaymentTopologyRecoveryCandidate {
  paymentId: string;
  requestCode: string;
  routeDate: string;
  account: string;
  status: string;
  reconciliationNeeded: boolean;
  reasonCode: string;
}

export interface ReconciledDailyTopologyEvidence {
  rootNodeId?: string;
  rootRevision?: string;
  routingDate?: string;
  logicalKey?: string;
  dateParentNodeId?: string;
  dateParentLogicalKey?: string;
  destinationNodeId?: string;
  destinationId?: string;
}

export interface ReconciledDailyTopologyDestination {
  destinationId: string;
  evidence: ReconciledDailyTopologyEvidence;
}

export interface DriveTopologyCleanupCandidate {
  id: string;
  parentId?: string;
  name?: string;
  label: string;
  eligible?: boolean;
  blockers?: string[];
  childIds?: string[];
}

export interface DriveTopologyCleanupResult {
  id: string;
  label: string;
  outcome: DriveTopologyCleanupOutcome;
  blockers?: string[];
}

export interface ReconcileCurrentPaymentDailyTopologyResult {
  paymentId: string;
  reconciled: boolean;
  alreadyReconciled?: boolean;
  authoritativeDestination: ReconciledDailyTopologyDestination;
  requestOrPaymentMoved: boolean;
  cleanupRequested: boolean;
  cleanupCandidates: DriveTopologyCleanupCandidate[];
  cleanupResults: DriveTopologyCleanupResult[];
  alreadyAbsent?: boolean;
  alreadyAbsentCandidates?: string[];
}

export interface DriveHierarchyPreflight {
  passes: boolean;
  rootId: string;
  driveId: string | null;
  name: string;
  issues: string[];
  capabilities: Record<string, boolean>;
  guidance: string[];
}

export interface DriveAclDirectGrant {
  nodeDriveId: string;
  permissionId: string;
  type: string;
  role: string;
  principalHash: string;
  allowFileDiscovery: boolean | null;
  deleted: boolean;
}

export interface DriveAclBaselinePreview {
  rootFolderId: string;
  sharedDriveId: string;
  rootRevision: number;
  complete: boolean;
  nodeCount: number;
  inventoryHash: string;
  manifestHash: string;
  reconciliationHash: string;
  freezeAuthorizationId: string;
  directGrantCount: number;
  topologyHash: string;
  aclHash: string;
  previewToken: string;
}

export interface DriveProvisionPlanItem {
  logicalKey: string;
  name: string;
  parentLogicalKey: string;
  parentDriveFolderId: string;
  operation: "CREATE_FOLDER" | "REUSE_EXISTING";
  existingDriveFolderId: string | null;
}

export interface DriveProvisionPlan {
  year: number;
  month: number | null;
  canary: boolean;
  rootLifecycle: DriveHierarchyLifecycle;
  planHash: string;
  mutations: DriveProvisionPlanItem[];
  createCount: number;
  reuseCount: number;
}

export interface RegisterDriveHierarchyRootInput {
  reason: string;
  confirmPreparing: boolean;
}

export interface CaptureDriveAclBaselineInput {
  reason: string;
  confirmCapture: boolean;
  expectedInventoryHash: string;
  expectedManifestHash: string;
  authorizationId: string;
  previewTokens: string[];
}

export interface TransitionDriveHierarchyRootInput {
  status: DriveHierarchyLifecycle;
  reason: string;
  evidenceRunIds?: string[];
  approvalReference?: string;
  authorizationId?: string;
}

export type DriveReadinessAuthorizationPurpose = "FREEZE" | "CAPTURE" | "READY";

export interface DriveReadinessAuthorizationTarget {
  id: string;
  displayName: string;
}

export interface IssueDriveReadinessAuthorizationInput {
  purpose: DriveReadinessAuthorizationPurpose;
  targetActorId: string;
  reason: string;
  manifestHash?: string;
  inventoryHash?: string;
  previewTokens?: string[];
  evidenceRunIds?: string[];
}

export interface DriveReadinessAuthorization {
  authorizationId: string;
  purpose: DriveReadinessAuthorizationPurpose;
  targetActorId: string;
  issuedAt: string;
  expiresAt: string;
}

export interface RevokeDriveReadinessAuthorizationResult {
  authorizationId: string;
  revokedAt: string;
}

export interface DriveReadinessReconciliation {
  reconciled: boolean;
  frozen: boolean;
  manifest_hash: string | null;
  reconciliation_hash: string | null;
  freeze_authorization_id: string | null;
  baseline_absent: boolean;
}

export interface FreezeDriveReadinessInput {
  expectedHash: string;
  authorizationId: string;
  reason: string;
}

export const DRIVE_READINESS_DISPOSITION = {
  KEEP: "KEEP",
  DELETE: "DELETE",
} as const;

export type DriveReadinessDisposition =
  (typeof DRIVE_READINESS_DISPOSITION)[keyof typeof DRIVE_READINESS_DISPOSITION];

export const DRIVE_READINESS_REFERENCE_STATUS = {
  CANONICAL: "CANONICAL",
  CLEAR: "CLEAR",
  BLOCKED: "BLOCKED",
} as const;

export type DriveReadinessReferenceStatus =
  (typeof DRIVE_READINESS_REFERENCE_STATUS)[keyof typeof DRIVE_READINESS_REFERENCE_STATUS];

export interface DriveReadinessReferenceDetail {
  code: "REFERENCE_PRESENT" | "REFERENCE_URL_MISMATCH" | "REFERENCE_DUPLICATE";
  sourceType: string;
  sourceId: string;
}

export interface DriveReadinessManifestRow {
  sequence: number;
  stableId: string;
  relativePath: string;
  itemType: string;
  disposition: DriveReadinessDisposition;
  reasonCode: string;
  referenceStatus: DriveReadinessReferenceStatus;
  referenceDetails?: DriveReadinessReferenceDetail[];
}

export interface DriveReadinessManifestPage {
  totalCount: number;
  keepCount: number;
  deleteCount: number;
  hash: string;
  rows: DriveReadinessManifestRow[];
  referenceDetailsByStableId?: Record<string, DriveReadinessReferenceDetail[]>;
  nextCursor: number | null;
}

export interface DriveReadinessDecisionInput {
  stableId: string;
  disposition: DriveReadinessDisposition;
  reasonCode: string;
}

export interface ReviewDriveReadinessManifestInput {
  expectedHash: string;
  decisions: DriveReadinessDecisionInput[];
  reason: string;
}

export interface ExportDriveReadinessManifestInput {
  expectedHash: string;
  decisions: DriveReadinessDecisionInput[];
}

export interface ReviewedDriveReadinessManifest {
  totalCount: number;
  keepCount: number;
  deleteCount: number;
  hash: string;
  rows: DriveReadinessManifestRow[];
  referenceDetailsByStableId?: Record<string, DriveReadinessReferenceDetail[]>;
}

export type DriveReadyGateState =
  "MISSING" | "FAIL" | "EXPIRED" | "PASS" | "RECOVERY_REQUIRED";

export interface DriveReadyGateStatus {
  gate: string;
  state: DriveReadyGateState;
  evidenceRunId: string | null;
  observedAt: string | null;
  expiresAt: string | null;
  issueCodes: string[];
}

export interface DriveReparentProofPlan {
  planHash: string;
  rootRevision: number;
  canaryNamePattern: string;
  originalParent: { logicalKey: "U:2026:01"; name: "NO-ASIGNADOS" };
  temporaryParent: { logicalKey: "M:2026:01"; name: "01.Enero" };
  operations: readonly ["CREATE", "MOVE", "RESTORE", "TRASH"];
  capabilitiesVerified: true;
  aclPolicyHash: string;
  expiresAt: string;
}

export interface DriveReparentProofAuthorization {
  authorizationId: string;
  targetActorId: string;
  planHash: string;
  issuedAt: string;
  expiresAt: string;
}

export type DriveReparentProofStage =
  | "CLAIMED"
  | "CREATE_INTENT"
  | "CREATED"
  | "MOVE_TEMP_INTENT"
  | "AT_TEMP"
  | "RESTORE_INTENT"
  | "RESTORED"
  | "PROOF_COMPLETED"
  | "CLEANUP_INTENT"
  | "CLEANED"
  | "RECOVERY_REQUIRED";

export interface DriveReparentProofRun {
  proofRunId: string;
  stage: DriveReparentProofStage;
  issueCode: string | null;
  proofAuditId: string | null;
  evidenceRunId: string | null;
  createdAt: string;
  updatedAt: string;
  nextAction: "WAIT" | "RECOVER" | "PRODUCE_BUNDLE" | "NONE";
}

export interface DriveReadyEvidenceStatus {
  target: "READY";
  gates: DriveReadyGateStatus[];
  completeCount: number;
  complete: boolean;
  orderedEvidenceRunIds: string[];
  minimumExpiresAt: string | null;
  proof: DriveReparentProofRun | null;
  latestCleanedProofRunId: string | null;
}

export interface DriveReadyBundleResult {
  complete: boolean;
  completedGateCount: number;
  evidenceRunIds: string[];
  minimumExpiresAt?: string;
  failedGate?: string;
}
