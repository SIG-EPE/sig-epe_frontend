import { api } from "@/lib/api-client";
import type {
  CaptureDriveAclBaselineInput,
  DriveAclBaselinePreview,
  DriveHierarchyNode,
  DrivePaymentProjectionHealth,
  DriveHierarchyPreflight,
  DriveHierarchyRootStatus,
  DriveProvisionPlan,
  RegisterDriveHierarchyRootInput,
  TransitionDriveHierarchyRootInput,
  RetryDrivePaymentProjectionInput,
  DriveReadinessManifestPage,
  ExportDriveReadinessManifestInput,
  ReviewDriveReadinessManifestInput,
  ReviewedDriveReadinessManifest,
  DriveReadinessAuthorization,
  DriveReadinessAuthorizationTarget,
  IssueDriveReadinessAuthorizationInput,
  RevokeDriveReadinessAuthorizationResult,
  DriveReadinessReconciliation,
  FreezeDriveReadinessInput,
  DriveReparentProofPlan,
  DriveReparentProofAuthorization,
  DriveReparentProofRun,
  DriveReadyEvidenceStatus,
  DriveReadyBundleResult,
  DriveGateEvidenceResult,
  ProduceDriveGateEvidenceInput,
  ReconcileCurrentPaymentDailyTopologyInput,
  ReconcileCurrentPaymentDailyTopologyResult,
  DrivePaymentTopologyRecoveryCandidate,
} from "@/types/drive-hierarchy";

const READY_BUNDLE_TIMEOUT_MS = 120_000;

function readyBundleSignal(signal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(READY_BUNDLE_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function planQuery(
  year: number,
  month: number | null,
  canary: boolean,
): string {
  const params = new URLSearchParams({ year: String(year) });
  if (month !== null) params.set("month", String(month));
  if (canary) params.set("canary", "true");
  return params.toString();
}

export const driveHierarchyApi = {
  produceGateEvidence: (
    input: ProduceDriveGateEvidenceInput,
    signal?: AbortSignal,
  ) =>
    api.post<DriveGateEvidenceResult>(
      "/drive-hierarchy/evidence/produce",
      input,
      { signal },
    ),
  getReadyEvidenceStatus: (signal?: AbortSignal) =>
    api.get<DriveReadyEvidenceStatus>(
      "/drive-hierarchy/evidence/status?target=READY",
      { signal },
    ),
  getReparentProofPlan: (signal?: AbortSignal) =>
    api.get<DriveReparentProofPlan>(
      "/drive-hierarchy/evidence/reparent-proof/plan",
      { signal },
    ),
  issueReparentProofAuthorization: (
    input: { targetActorId: string; proofPlanHash: string; reason: string },
    signal?: AbortSignal,
  ) =>
    api.post<DriveReparentProofAuthorization>(
      "/drive-hierarchy/evidence/reparent-proof/authorizations",
      input,
      { signal },
    ),
  runReparentProof: (
    input: {
      authorizationId: string;
      idempotencyKey: string;
      proofPlanHash: string;
      reason: string;
      confirmRealDriveMutation: boolean;
    },
    signal?: AbortSignal,
  ) =>
    api.post<DriveReparentProofRun>(
      "/drive-hierarchy/evidence/reparent-proof/runs",
      input,
      { signal },
    ),
  getReparentProofRun: (runId: string, signal?: AbortSignal) =>
    api.get<DriveReparentProofRun>(
      `/drive-hierarchy/evidence/reparent-proof/runs/${runId}`,
      { signal },
    ),
  recoverReparentProof: (
    runId: string,
    input: { reason: string; confirmCompensation: boolean },
    signal?: AbortSignal,
  ) =>
    api.post<DriveReparentProofRun>(
      `/drive-hierarchy/evidence/reparent-proof/runs/${runId}/recover`,
      input,
      { signal },
    ),
  produceReadyBundle: (
    input: { operationId: string; reason: string; proofRunId: string },
    signal?: AbortSignal,
  ) =>
    api.post<DriveReadyBundleResult>(
      "/drive-hierarchy/evidence/ready-bundle/produce",
      input,
      { signal: readyBundleSignal(signal) },
    ),
  getReadinessReconciliation: (signal?: AbortSignal) =>
    api.get<DriveReadinessReconciliation>(
      "/drive-hierarchy/readiness/reconciliation",
      { signal },
    ),
  freezeReadiness: (input: FreezeDriveReadinessInput, signal?: AbortSignal) =>
    api.post<DriveReadinessReconciliation>(
      "/drive-hierarchy/readiness/freeze",
      input,
      { signal },
    ),
  getReadinessAuthorizationTargets: (signal?: AbortSignal) =>
    api.get<DriveReadinessAuthorizationTarget[]>(
      "/drive-hierarchy/readiness/authorization-targets",
      { signal },
    ),
  issueReadinessAuthorization: (
    input: IssueDriveReadinessAuthorizationInput,
    signal?: AbortSignal,
  ) =>
    api.post<DriveReadinessAuthorization>(
      "/drive-hierarchy/readiness/authorizations",
      input,
      { signal },
    ),
  revokeReadinessAuthorization: (
    authorizationId: string,
    reason: string,
    signal?: AbortSignal,
  ) =>
    api.post<RevokeDriveReadinessAuthorizationResult>(
      `/drive-hierarchy/readiness/authorizations/${authorizationId}/revoke`,
      { reason },
      { signal },
    ),
  getReadinessManifest: (cursor: number, limit: number, signal?: AbortSignal) =>
    api.get<DriveReadinessManifestPage>(
      `/drive-hierarchy/readiness/manifest?cursor=${cursor}&limit=${limit}`,
      { signal },
    ),
  downloadReadinessManifest: (
    input: ExportDriveReadinessManifestInput,
    signal?: AbortSignal,
  ) =>
    api.downloadCsv("/drive-hierarchy/readiness/manifest.csv", input, {
      signal,
    }),
  reviewReadinessManifest: (
    input: ReviewDriveReadinessManifestInput,
    signal?: AbortSignal,
  ) =>
    api.post<ReviewedDriveReadinessManifest>(
      "/drive-hierarchy/readiness/manifest/review",
      input,
      { signal },
    ),
  getRoot: (signal?: AbortSignal) =>
    api.get<DriveHierarchyRootStatus>("/drive-hierarchy/root", { signal }),
  getNodes: (signal?: AbortSignal) =>
    api.get<DriveHierarchyNode[]>("/drive-hierarchy/nodes", { signal }),
  getPaymentProjectionHealth: (signal?: AbortSignal) =>
    api.get<DrivePaymentProjectionHealth>(
      "/drive-hierarchy/payment-projections/health",
      { signal },
    ),
  getPaymentTopologyRecoveryCandidates: (signal?: AbortSignal) =>
    api.get<DrivePaymentTopologyRecoveryCandidate[]>(
      "/drive-hierarchy/payment-projections/recovery-candidates",
      { signal },
    ),
  retryPaymentProjection: (
    paymentId: string,
    input: RetryDrivePaymentProjectionInput,
    signal?: AbortSignal,
  ) =>
    api.post(`/request-payments/${paymentId}/drive-projection/retry`, input, {
      signal,
    }),
  reconcileCurrentPaymentDailyTopology: (
    paymentId: string,
    input: ReconcileCurrentPaymentDailyTopologyInput,
    signal?: AbortSignal,
  ) =>
    api.post<ReconcileCurrentPaymentDailyTopologyResult>(
      `/request-payments/${paymentId}/drive-topology/reconcile-current`,
      input,
      { signal },
    ),
  preflight: (signal?: AbortSignal) =>
    api.get<DriveHierarchyPreflight>("/drive-hierarchy/preflight", { signal }),
  previewAclBaseline: (signal?: AbortSignal) =>
    api.get<DriveAclBaselinePreview>(
      "/drive-hierarchy/evidence/acl-baselines/preview",
      { signal },
    ),
  captureAclBaseline: (
    input: CaptureDriveAclBaselineInput,
    signal?: AbortSignal,
  ) =>
    api.post("/drive-hierarchy/evidence/acl-baselines/capture", input, {
      signal,
    }),
  plan: (
    year: number,
    month: number | null,
    canary: boolean,
    signal?: AbortSignal,
  ) =>
    api.get<DriveProvisionPlan>(
      `/drive-hierarchy/provision-plan?${planQuery(year, month, canary)}`,
      { signal },
    ),
  registerRoot: (
    input: RegisterDriveHierarchyRootInput,
    signal?: AbortSignal,
  ) =>
    api.post<DriveHierarchyNode>("/drive-hierarchy/root/register", input, {
      signal,
    }),
  transition: (
    input: TransitionDriveHierarchyRootInput,
    signal?: AbortSignal,
  ) =>
    api.patch<DriveHierarchyNode>("/drive-hierarchy/root/lifecycle", input, {
      signal,
    }),
  provision: (plan: DriveProvisionPlan, reason: string, signal?: AbortSignal) =>
    api.post<DriveHierarchyNode[]>(
      "/drive-hierarchy/provision",
      {
        year: plan.year,
        month: plan.month ?? undefined,
        canary: plan.canary,
        planHash: plan.planHash,
        confirmMutations: true,
        reason,
      },
      { signal },
    ),
};
