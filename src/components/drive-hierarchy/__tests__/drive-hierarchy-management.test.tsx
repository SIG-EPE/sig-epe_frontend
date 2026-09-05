import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DriveHierarchyManagement,
  hasExactAclPreviewContinuity,
} from "@/components/drive-hierarchy/drive-hierarchy-management";
import { ApiRequestError } from "@/lib/api-client";
import type {
  DriveAclBaselinePreview,
  DriveReadinessManifestRow,
  DriveReadinessReconciliation,
} from "@/types/drive-hierarchy";

const mocks = vi.hoisted(() => ({
  role: "GIOF_GESTOR",
  getRoot: vi.fn(),
  getNodes: vi.fn(),
  getPaymentProjectionHealth: vi.fn(),
  retryPaymentProjection: vi.fn(),
  registerRoot: vi.fn(),
  transition: vi.fn(),
  preflight: vi.fn(),
  previewAclBaseline: vi.fn(),
  captureAclBaseline: vi.fn(),
  getReadinessManifest: vi.fn(),
  downloadReadinessManifest: vi.fn(),
  reviewReadinessManifest: vi.fn(),
  getReadinessReconciliation: vi.fn(),
  freezeReadiness: vi.fn(),
  plan: vi.fn(),
  getReadinessAuthorizationTargets: vi.fn(),
  issueReadinessAuthorization: vi.fn(),
  revokeReadinessAuthorization: vi.fn(),
  getReadyEvidenceStatus: vi.fn(),
  getReparentProofPlan: vi.fn(),
  issueReparentProofAuthorization: vi.fn(),
  runReparentProof: vi.fn(),
  getReparentProofRun: vi.fn(),
  recoverReparentProof: vi.fn(),
  produceReadyBundle: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

const ACL_PREVIEW: DriveAclBaselinePreview = {
  rootFolderId: "root-id",
  sharedDriveId: "shared-drive-id",
  rootRevision: 1,
  complete: true,
  nodeCount: 74,
  inventoryHash: "a".repeat(64),
  manifestHash: "m".repeat(64),
  reconciliationHash: "r".repeat(64),
  freezeAuthorizationId: "freeze-auth",
  directGrantCount: 2,
  topologyHash: "t".repeat(64),
  aclHash: "d".repeat(64),
  previewToken: "preview-a",
};

const ACL_PREVIEW_MISMATCHES: Partial<DriveAclBaselinePreview> = {
  rootFolderId: "other-root-id",
  sharedDriveId: "other-shared-drive-id",
  rootRevision: 2,
  complete: false,
  nodeCount: 75,
  inventoryHash: "b".repeat(64),
  manifestHash: "n".repeat(64),
  reconciliationHash: "s".repeat(64),
  freezeAuthorizationId: "other-freeze-auth",
  directGrantCount: 3,
  topologyHash: "u".repeat(64),
  aclHash: "e".repeat(64),
};

const READY_EVIDENCE_IDS = Array.from(
  { length: 8 },
  (_, index) =>
    `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

describe("hasExactAclPreviewContinuity", () => {
  it.each(Object.entries(ACL_PREVIEW_MISMATCHES))(
    "fails closed when %s mismatches",
    (field, value) => {
      expect(
        hasExactAclPreviewContinuity(ACL_PREVIEW, {
          ...ACL_PREVIEW,
          previewToken: "preview-b",
          [field]: value,
        }),
      ).toBe(false);
    },
  );

  it.each(Object.keys(ACL_PREVIEW_MISMATCHES))(
    "fails closed when required field %s is missing from either preview",
    (field) => {
      const missingFromPrevious = { ...ACL_PREVIEW } as Record<string, unknown>;
      const missingFromCurrent = {
        ...ACL_PREVIEW,
        previewToken: "preview-b",
      } as Record<string, unknown>;
      delete missingFromPrevious[field];
      delete missingFromCurrent[field];

      expect(
        hasExactAclPreviewContinuity(
          missingFromPrevious as unknown as DriveAclBaselinePreview,
          { ...ACL_PREVIEW, previewToken: "preview-b" },
        ),
      ).toBe(false);
      expect(
        hasExactAclPreviewContinuity(
          ACL_PREVIEW,
          missingFromCurrent as unknown as DriveAclBaselinePreview,
        ),
      ).toBe(false);
    },
  );

  it.each([
    ["empty first token", "", "preview-b"],
    ["blank first token", "   ", "preview-b"],
    ["empty second token", "preview-a", ""],
    ["blank second token", "preview-a", "   "],
    ["duplicate tokens", "preview-same", "preview-same"],
  ])("fails closed for %s", (_name, firstToken, secondToken) => {
    expect(
      hasExactAclPreviewContinuity(
        { ...ACL_PREVIEW, previewToken: firstToken },
        { ...ACL_PREVIEW, previewToken: secondToken },
      ),
    ).toBe(false);
  });

  it("compares additional signed preview fields exposed at runtime", () => {
    const previous = { ...ACL_PREVIEW, signedContext: "signed-a" };
    const current = {
      ...ACL_PREVIEW,
      previewToken: "preview-b",
      signedContext: "signed-b",
    };

    expect(
      hasExactAclPreviewContinuity(
        previous as DriveAclBaselinePreview,
        current as DriveAclBaselinePreview,
      ),
    ).toBe(false);
  });

  it("accepts exactly matching context with two distinct non-empty tokens", () => {
    expect(
      hasExactAclPreviewContinuity(ACL_PREVIEW, {
        ...ACL_PREVIEW,
        previewToken: "preview-b",
      }),
    ).toBe(true);
  });
});

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { role: { code: mocks.role } } }),
}));

vi.mock("@/lib/drive-hierarchy-api", () => ({
  driveHierarchyApi: {
    getRoot: mocks.getRoot,
    getNodes: mocks.getNodes,
    getPaymentProjectionHealth: mocks.getPaymentProjectionHealth,
    retryPaymentProjection: mocks.retryPaymentProjection,
    preflight: mocks.preflight,
    previewAclBaseline: mocks.previewAclBaseline,
    captureAclBaseline: mocks.captureAclBaseline,
    getReadinessManifest: mocks.getReadinessManifest,
    downloadReadinessManifest: mocks.downloadReadinessManifest,
    reviewReadinessManifest: mocks.reviewReadinessManifest,
    getReadinessReconciliation: mocks.getReadinessReconciliation,
    freezeReadiness: mocks.freezeReadiness,
    plan: mocks.plan,
    registerRoot: mocks.registerRoot,
    transition: mocks.transition,
    provision: vi.fn(),
    getReadinessAuthorizationTargets: mocks.getReadinessAuthorizationTargets,
    issueReadinessAuthorization: mocks.issueReadinessAuthorization,
    revokeReadinessAuthorization: mocks.revokeReadinessAuthorization,
    getReadyEvidenceStatus: mocks.getReadyEvidenceStatus,
    getReparentProofPlan: mocks.getReparentProofPlan,
    issueReparentProofAuthorization: mocks.issueReparentProofAuthorization,
    runReparentProof: mocks.runReparentProof,
    getReparentProofRun: mocks.getReparentProofRun,
    recoverReparentProof: mocks.recoverReparentProof,
    produceReadyBundle: mocks.produceReadyBundle,
  },
}));

describe("DriveHierarchyManagement", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "GIOF_GESTOR";
    mocks.getRoot.mockResolvedValue({
      registered: true,
      legacyBehavior: false,
      root: {
        id: "root-node",
        parent_id: null,
        node_kind: "ROOT",
        lifecycle_status: "PREPARING",
        logical_key: "ROOT:1HfBYmn3WNhvSY9Iz7DaQIdzXDCihmdfq",
        name: "SIG",
        drive_folder_id: "1HfBYmn3WNhvSY9Iz7DaQIdzXDCihmdfq",
        version: 1,
        last_error_code: null,
        last_error_message: null,
        last_error_at: null,
      },
    });
    mocks.getNodes.mockResolvedValue([]);
    mocks.getPaymentProjectionHealth.mockResolvedValue({
      workerEnabled: false,
      lifecycleStatus: "PREPARING",
      active: false,
      counts: {
        SOURCE_REQUIRED: 0,
        PENDING: 0,
        PROCESSING: 0,
        SUCCEEDED: 0,
        FAILED: 0,
      },
      eligibleCount: 0,
      dueCount: 0,
      oldestEligibleAt: null,
      oldestEligibleLagSeconds: null,
      oldestDueAt: null,
      errors: [],
    });
    mocks.retryPaymentProjection.mockResolvedValue({});
    mocks.registerRoot.mockResolvedValue({});
    mocks.transition.mockResolvedValue({});
    mocks.preflight.mockResolvedValue({
      passes: true,
      issues: [],
      guidance: [],
    });
    mocks.captureAclBaseline.mockResolvedValue({});
    mocks.getReadinessReconciliation.mockResolvedValue({
      reconciled: true,
      frozen: true,
      manifest_hash: "c".repeat(64),
      reconciliation_hash: "r".repeat(64),
      freeze_authorization_id: "freeze-consumed",
      baseline_absent: true,
    });
    mocks.freezeReadiness.mockResolvedValue({ frozen: true });
    mocks.getReadinessManifest.mockResolvedValue({
      totalCount: 4,
      keepCount: 4,
      deleteCount: 0,
      hash: "c".repeat(64),
      nextCursor: null,
      referenceDetailsByStableId: {},
      rows: [
        ["1HfBYmn3WNhvSY9Iz7DaQIdzXDCihmdfq", "SIG"],
        ["1ih2MD9nA_JJ2gDlQlznGr1rmiRAFEv4r", "2026"],
        ["1jYsfYMsGM7vPOPO_YqohEcOGJWnHS6Ng", "2026/01.Enero"],
        ["12YGBPNRV6hmxqJGqJRtHCyieUZfwJMIX", "2026/01.Enero/NO-ASIGNADOS"],
      ].map(([stableId, relativePath], index) => ({
        sequence: index + 1,
        stableId,
        relativePath,
        itemType: "FOLDER",
        disposition: "KEEP",
        reasonCode: "CANONICAL_REQUIRED",
        referenceStatus: "CANONICAL",
      })),
    });
    mocks.reviewReadinessManifest.mockResolvedValue({
      totalCount: 74,
      keepCount: 74,
      deleteCount: 0,
      hash: "d".repeat(64),
      rows: [],
      referenceDetailsByStableId: {},
    });
    mocks.downloadReadinessManifest.mockResolvedValue({
      blob: new Blob(["safe,csv"]),
      filename: "drive-b1-readiness.csv",
    });
    mocks.plan.mockResolvedValue({
      year: 2026,
      month: null,
      canary: true,
      rootLifecycle: "PREPARING",
      planHash: "plan-hash",
      mutations: [],
      createCount: 0,
      reuseCount: 0,
    });
    mocks.getReadinessAuthorizationTargets.mockResolvedValue([
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        displayName: "Gestora Segura",
      },
    ]);
    mocks.issueReadinessAuthorization.mockResolvedValue({
      authorizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      purpose: "FREEZE",
      targetActorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      issuedAt: "2026-08-19T10:00:00.000Z",
      expiresAt: "2026-08-19T10:05:00.000Z",
    });
    mocks.revokeReadinessAuthorization.mockResolvedValue({
      authorizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      revokedAt: "2026-08-19T10:01:00.000Z",
    });
    mocks.getReadyEvidenceStatus.mockResolvedValue({
      target: "READY",
      gates: [],
      completeCount: 0,
      complete: false,
      orderedEvidenceRunIds: [],
      minimumExpiresAt: null,
      proof: null,
    });
    mocks.getReparentProofPlan.mockResolvedValue({
      planHash: "a".repeat(64),
      rootRevision: 1,
      canaryNamePattern: ".SIG-EPE-REPARENT-CANARY-{proofRunId}",
      originalParent: { logicalKey: "U:2026:01", name: "NO-ASIGNADOS" },
      temporaryParent: { logicalKey: "M:2026:01", name: "01.Enero" },
      operations: ["CREATE", "MOVE", "RESTORE", "TRASH"],
      capabilitiesVerified: true,
      aclPolicyHash: "b".repeat(64),
      expiresAt: "2026-08-19T10:05:00.000Z",
    });
    mocks.runReparentProof.mockResolvedValue({
      proofRunId: "30000000-0000-4000-8000-000000000001",
      stage: "CLEANED",
      issueCode: null,
      proofAuditId: "40000000-0000-4000-8000-000000000001",
      evidenceRunId: null,
      createdAt: "2026-08-19T10:00:00.000Z",
      updatedAt: "2026-08-19T10:01:00.000Z",
      nextAction: "PRODUCE_BUNDLE",
    });
    mocks.produceReadyBundle.mockResolvedValue({
      complete: true,
      completedGateCount: 7,
      evidenceRunIds: READY_EVIDENCE_IDS.slice(0, 7),
      minimumExpiresAt: "2026-08-19T10:15:00.000Z",
    });
  });

  it("fails closed for ordinary GIOF_GESTOR without hierarchy reads or controls", () => {
    render(<DriveHierarchyManagement />);

    expect(mocks.getRoot).not.toHaveBeenCalled();
    expect(mocks.getNodes).not.toHaveBeenCalled();
    expect(mocks.getPaymentProjectionHealth).not.toHaveBeenCalled();
    expect(mocks.getReadinessReconciliation).not.toHaveBeenCalled();
    expect(mocks.getReadinessAuthorizationTargets).not.toHaveBeenCalled();
    expect(screen.queryByText("Raíz y ciclo de vida")).not.toBeInTheDocument();
    expect(screen.queryByText(/Nodos y errores/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ejecutar preflight" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cambiar estado" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Autorizaciones de preparación Drive"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Preparación y consumo de autorizaciones"),
    ).not.toBeInTheDocument();
  });

  it("requires explicit CREATE/MOVE/RESTORE/TRASH confirmation and auto-fills only a complete bundle", async () => {
    mocks.role = "GIOF_MANAGER";
    const untrustedCommandIds = READY_EVIDENCE_IDS.slice(1, 8);
    mocks.produceReadyBundle.mockResolvedValue({
      complete: true,
      completedGateCount: 7,
      evidenceRunIds: untrustedCommandIds,
      minimumExpiresAt: "2026-08-19T10:15:00.000Z",
    });
    mocks.getReadyEvidenceStatus.mockImplementation(async () => {
      const proof =
        mocks.runReparentProof.mock.calls.length > 0
          ? await mocks.runReparentProof.mock.results[0].value
          : null;
      const complete = mocks.produceReadyBundle.mock.calls.length > 0;
      return {
        target: "READY",
        gates: [],
        completeCount: complete ? 7 : 0,
        complete,
        orderedEvidenceRunIds: complete ? READY_EVIDENCE_IDS.slice(0, 7) : [],
        minimumExpiresAt: complete ? "2026-08-19T10:15:00.000Z" : null,
        proof,
      };
    });
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    await user.click(
      await screen.findByRole("button", { name: "Ver plan sin mutar" }),
    );
    const runButton = await screen.findByRole("button", {
      name: "Ejecutar prueba real confirmada",
    });
    fireEvent.change(screen.getByLabelText("ID de autorización reparent"), {
      target: { value: "10000000-0000-4000-8000-000000000001" },
    });
    expect(runButton).toBeDisabled();
    await user.click(
      screen.getByLabelText(
        "Confirmar mutación real create move restore trash",
      ),
    );
    fireEvent.change(
      screen.getByLabelText("Razón para ejecutar prueba reparent"),
      {
        target: { value: "Prueba descartable autorizada" },
      },
    );
    expect(runButton).toBeEnabled();
    await user.click(runButton);

    await waitFor(() =>
      expect(mocks.runReparentProof).toHaveBeenCalledWith(
        expect.objectContaining({
          authorizationId: "10000000-0000-4000-8000-000000000001",
          proofPlanHash: "a".repeat(64),
          reason: "Prueba descartable autorizada",
          confirmRealDriveMutation: true,
        }),
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByText(/Etapa de prueba:/)).toHaveTextContent(
      "CLEANED",
    );
    fireEvent.change(
      screen.getByLabelText("Razón para producir bundle READY"),
      {
        target: { value: "Producir siete gates sin transición" },
      },
    );
    await user.click(
      screen.getByRole("button", { name: "Producir bundle READY" }),
    );
    await waitFor(() => expect(mocks.produceReadyBundle).toHaveBeenCalledOnce());
    expect(mocks.produceReadyBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "Producir siete gates sin transición",
        proofRunId: "30000000-0000-4000-8000-000000000001",
      }),
      expect.any(AbortSignal),
    );
    expect(mocks.runReparentProof).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.getByLabelText("Evidencias READY para consumo"),
      ).toHaveValue(READY_EVIDENCE_IDS.slice(0, 7).join(",")),
    );
    expect(
      screen.getByLabelText("Evidencias READY para consumo"),
    ).not.toHaveValue(untrustedCommandIds.join(","));
    expect(mocks.transition).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "ACTIVE" }),
      expect.anything(),
    );
  });

  it("hydrates and polls proof progression only from authoritative READY status", async () => {
    vi.useFakeTimers();
    mocks.role = "GIOF_MANAGER";
    const claimed = {
      proofRunId: "30000000-0000-4000-8000-000000000010",
      stage: "CLAIMED",
      issueCode: null,
      proofAuditId: null,
      evidenceRunId: null,
      createdAt: "2026-08-19T10:00:00.000Z",
      updatedAt: "2026-08-19T10:00:00.000Z",
      nextAction: "WAIT",
    };
    const recovery = {
      ...claimed,
      stage: "RECOVERY_REQUIRED",
      issueCode: "REPARENT_RECOVERY_REQUIRED",
      updatedAt: "2026-08-19T10:01:00.000Z",
      nextAction: "RECOVER",
    };
    mocks.getReadyEvidenceStatus
      .mockResolvedValueOnce({
        target: "READY",
        gates: [],
        completeCount: 0,
        complete: false,
         orderedEvidenceRunIds: [],
         minimumExpiresAt: null,
         latestCleanedProofRunId: null,
         proof: claimed,
      })
      .mockResolvedValue({
        target: "READY",
        gates: [],
        completeCount: 0,
        complete: false,
         orderedEvidenceRunIds: [],
         minimumExpiresAt: null,
         latestCleanedProofRunId: null,
         proof: recovery,
      });

    const rendered = render(<DriveHierarchyManagement />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("status")).toHaveTextContent("CLAIMED");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(screen.getByRole("status")).toHaveTextContent("RECOVERY_REQUIRED");
    expect(
      screen.getByRole("button", {
        name: "Recuperar solo restaurando/eliminando",
      }),
    ).toBeInTheDocument();
    expect(mocks.runReparentProof).not.toHaveBeenCalled();
    const terminalCallCount = mocks.getReadyEvidenceStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mocks.getReadyEvidenceStatus).toHaveBeenCalledTimes(terminalCallCount);
    rendered.unmount();
  });

  it("hydrates the latest CLEANED proof on reload with 5/7 gates and enables bundle only after reason", async () => {
    mocks.role = "GIOF_MANAGER";
    const proofRunId = "30000000-0000-4000-8000-000000000025";
    const cleanedProof = {
      proofRunId,
      stage: "CLEANED",
      issueCode: null,
      proofAuditId: "40000000-0000-4000-8000-000000000025",
      evidenceRunId: null,
      createdAt: "2026-08-19T10:00:00.000Z",
      updatedAt: "2026-08-19T10:01:00.000Z",
      nextAction: "PRODUCE_BUNDLE",
    };
    mocks.getReadyEvidenceStatus.mockResolvedValue({
      target: "READY",
      gates: [],
      completeCount: 5,
      complete: false,
      orderedEvidenceRunIds: [],
      minimumExpiresAt: "2026-08-19T10:15:00.000Z",
      proof: null,
      latestCleanedProofRunId: proofRunId,
    });
    mocks.getReparentProofRun.mockResolvedValue(cleanedProof);
    const user = userEvent.setup();

    render(<DriveHierarchyManagement />);

    expect(await screen.findByText(/Etapa de prueba:/)).toHaveTextContent(
      "CLEANED",
    );
    expect(mocks.getReparentProofRun).toHaveBeenCalledWith(
      proofRunId,
      expect.any(AbortSignal),
    );
    const bundleButton = screen.getByRole("button", {
      name: "Producir bundle READY",
    });
    expect(bundleButton).toBeDisabled();
    await user.type(
      screen.getByLabelText("Razón para producir bundle READY"),
      "Completar gates seis y siete",
    );
    expect(bundleButton).toBeEnabled();
    await user.click(bundleButton);

    await waitFor(() =>
      expect(mocks.produceReadyBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "Completar gates seis y siete",
          proofRunId,
        }),
        expect.any(AbortSignal),
      ),
    );
    expect(mocks.runReparentProof).not.toHaveBeenCalled();
  });

  it.each([
    ["no proof run", null, false],
    [
      "CLEANED",
      {
        proofRunId: "30000000-0000-4000-8000-000000000020",
        stage: "CLEANED",
        issueCode: null,
        proofAuditId: "40000000-0000-4000-8000-000000000020",
        evidenceRunId: null,
        createdAt: "2026-08-19T10:00:00.000Z",
        updatedAt: "2026-08-19T10:01:00.000Z",
        nextAction: "PRODUCE_BUNDLE",
      },
      false,
    ],
    ["complete bundle", null, true],
  ])("performs one initial READY read and stops for %s", async (_name, proof, complete) => {
    vi.useFakeTimers();
    mocks.role = "GIOF_MANAGER";
    mocks.getReadyEvidenceStatus.mockResolvedValue({
      target: "READY",
      gates: [],
      completeCount: complete ? 7 : 0,
      complete,
      orderedEvidenceRunIds: complete ? READY_EVIDENCE_IDS.slice(0, 7) : [],
      minimumExpiresAt: complete ? "2026-08-19T10:15:00.000Z" : null,
      proof,
    });

    const rendered = render(<DriveHierarchyManagement />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mocks.getReadyEvidenceStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mocks.getReadyEvidenceStatus).toHaveBeenCalledTimes(1);
    rendered.unmount();
  });

  it("honors Retry-After on a 429 without polling or toast storms", async () => {
    vi.useFakeTimers();
    mocks.role = "GIOF_MANAGER";
    const activeProof = {
      proofRunId: "30000000-0000-4000-8000-000000000021",
      stage: "CLAIMED",
      issueCode: null,
      proofAuditId: null,
      evidenceRunId: null,
      createdAt: "2026-08-19T10:00:00.000Z",
      updatedAt: "2026-08-19T10:00:00.000Z",
      nextAction: "WAIT",
    };
    mocks.getReadyEvidenceStatus
      .mockResolvedValueOnce({
        target: "READY",
        gates: [],
        completeCount: 0,
        complete: false,
        orderedEvidenceRunIds: [],
        minimumExpiresAt: null,
        proof: activeProof,
      })
      .mockRejectedValueOnce(
        new ApiRequestError(
          429,
          { message: "Too many requests" } as never,
          new Headers({ "Retry-After": "7" }),
        ),
      )
      .mockResolvedValue({
        target: "READY",
        gates: [],
        completeCount: 0,
        complete: false,
        orderedEvidenceRunIds: [],
        minimumExpiresAt: null,
        proof: { ...activeProof, stage: "CLEANED", nextAction: "PRODUCE_BUNDLE" },
      });

    const rendered = render(<DriveHierarchyManagement />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(mocks.getReadyEvidenceStatus).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_999);
    });
    expect(mocks.getReadyEvidenceStatus).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.getReadyEvidenceStatus).toHaveBeenCalledTimes(3);
    expect(mocks.toastError).not.toHaveBeenCalled();
    rendered.unmount();
  });

  it("reuses one proof idempotency UUID when the same authorization and plan are retried", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.runReparentProof
      .mockRejectedValueOnce(
        new ApiRequestError(504, { message: "Gateway timeout" } as never),
      )
      .mockResolvedValueOnce({
        proofRunId: "30000000-0000-4000-8000-000000000099",
        stage: "CLEANED",
        issueCode: null,
        proofAuditId: "40000000-0000-4000-8000-000000000099",
        evidenceRunId: null,
        createdAt: "2026-08-19T10:00:00.000Z",
        updatedAt: "2026-08-19T10:01:00.000Z",
        nextAction: "PRODUCE_BUNDLE",
      });
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);
    await user.click(
      await screen.findByRole("button", { name: "Ver plan sin mutar" }),
    );
    fireEvent.change(screen.getByLabelText("ID de autorización reparent"), {
      target: { value: "10000000-0000-4000-8000-000000000001" },
    });
    fireEvent.change(
      screen.getByLabelText("Razón para ejecutar prueba reparent"),
      { target: { value: "Retry same authorized proof" } },
    );
    await user.click(
      screen.getByLabelText("Confirmar mutación real create move restore trash"),
    );
    const runButton = screen.getByRole("button", {
      name: "Ejecutar prueba real confirmada",
    });
    await user.click(runButton);
    await waitFor(() => expect(mocks.runReparentProof).toHaveBeenCalledTimes(1));
    await user.click(runButton);
    await waitFor(() => expect(mocks.runReparentProof).toHaveBeenCalledTimes(2));

    expect(mocks.runReparentProof.mock.calls[0][0].idempotencyKey).toBe(
      mocks.runReparentProof.mock.calls[1][0].idempotencyKey,
    );
  });

  it("shows manager projection counts, oldest lag, safe errors and audited retry", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getRoot.mockResolvedValue({
      registered: true,
      legacyBehavior: false,
      root: {
        id: "root-node",
        lifecycle_status: "PAUSED",
        drive_folder_id: "root-id",
      },
    });
    mocks.getPaymentProjectionHealth.mockResolvedValue({
      workerEnabled: false,
      lifecycleStatus: "PAUSED",
      active: false,
      counts: {
        SOURCE_REQUIRED: 1,
        PENDING: 2,
        PROCESSING: 0,
        SUCCEEDED: 7,
        FAILED: 1,
      },
      eligibleCount: 4,
      dueCount: 2,
      oldestEligibleAt: "2026-08-17T10:00:00.000Z",
      oldestEligibleLagSeconds: 7200,
      oldestDueAt: "2026-08-17T11:00:00.000Z",
      errors: [
        {
          paymentId: "11111111-1111-4111-8111-111111111111",
          status: "FAILED",
          attemptCount: 5,
          maxAttempts: 5,
          nextAttemptAt: "2026-08-17T11:00:00.000Z",
          completedAt: null,
          errorCode: "DRIVE_PERMISSION_DENIED",
          errorMessage: "safe error",
        },
      ],
    });
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    expect(await screen.findByText("Proyecciones de pago")).toBeInTheDocument();
    expect(screen.getByText(/Pendientes: 2/)).toBeInTheDocument();
    expect(screen.getByText(/2 h/)).toBeInTheDocument();
    expect(screen.getByText("DRIVE_PERMISSION_DENIED")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Reintentar proyección" }),
    );
    fireEvent.change(screen.getByLabelText("Razón de la operación"), {
      target: { value: "Permiso corregido y revisado" },
    });
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(mocks.retryPaymentProjection).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
        { reason: "Permiso corregido y revisado" },
        expect.any(AbortSignal),
      ),
    );
  });

  it("registers PREPARING with reason and confirmation only", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getRoot
      .mockResolvedValueOnce({
        registered: false,
        legacyBehavior: true,
        configuredRootId: "1HfBYmn3WNhvSY9Iz7DaQIdzXDCihmdfq",
        root: null,
      })
      .mockResolvedValueOnce({
        registered: true,
        legacyBehavior: false,
        root: null,
      });
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    await user.click(
      await screen.findByRole("button", { name: "Ejecutar preflight" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Registrar como PREPARING" }),
    );
    fireEvent.change(screen.getByLabelText("Razón de la operación"), {
      target: { value: "Registrar SIG después del contrato exacto" },
    });
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(mocks.registerRoot).toHaveBeenCalledWith(
        {
          reason: "Registrar SIG después del contrato exacto",
          confirmPreparing: true,
        },
        expect.any(AbortSignal),
      ),
    );
    const payload = mocks.registerRoot.mock.calls[0][0];
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("evidence");
    expect(payload).not.toHaveProperty("evidenceHash");
    expect(payload).not.toHaveProperty("schemaEvidenceRunId");
    expect(payload).not.toHaveProperty("approvalReference");
  });

  it("does not expose READY or ACTIVE in the simplified PREPARING rollout", async () => {
    mocks.role = "GIOF_MANAGER";
    render(<DriveHierarchyManagement />);

    const lifecycle = await screen.findByRole("combobox", {
      name: "Estado de ciclo de vida",
    });
    expect(lifecycle).not.toHaveTextContent("READY");
    expect(lifecycle).not.toHaveTextContent("ACTIVE");
  });

  it("shows a valid four-row canonical readiness review without cleanup controls", async () => {
    mocks.role = "GIOF_MANAGER";
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    await user.click(
      await screen.findByRole("button", {
        name: "Cargar manifiesto",
      }),
    );

    expect(await screen.findByText("SIG")).toBeInTheDocument();
    expect(screen.getByText(/Hash: c{64}/)).toBeInTheDocument();
    expect(
      screen.getByText(/KEEP 4 · DELETE 0 · total 4 · cobertura completa/),
    ).toBeInTheDocument();
    expect(mocks.getReadinessManifest).toHaveBeenCalledWith(
      0,
      25,
      expect.any(AbortSignal),
    );
    expect(
      screen.queryByText(/email|principal|permission|token/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Ejecutar limpieza/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Marcar READY/i }),
    ).toBeDisabled();
  });

  it.each([
    "non-advancing cursor",
    "changed snapshot hash",
    "duplicate stable ID",
    "sequence gap",
    "incomplete final total",
  ])("rejects a dynamically paged manifest with a %s", async (failure) => {
    mocks.role = "GIOF_MANAGER";
    const rows = readinessRows().slice(0, 5);
    mocks.getReadinessManifest.mockImplementation(async (cursor: number) => {
      if (cursor === 0) {
        return {
          totalCount: failure === "incomplete final total" ? 6 : 5,
          keepCount: failure === "incomplete final total" ? 6 : 5,
          deleteCount: 0,
          hash: "c".repeat(64),
          rows: rows.slice(0, 4),
          referenceDetailsByStableId: {},
          nextCursor: failure === "non-advancing cursor" ? 0 : 4,
        };
      }
      const finalRow = {
        ...rows[4],
        stableId:
          failure === "duplicate stable ID"
            ? rows[0].stableId
            : rows[4].stableId,
        sequence: failure === "sequence gap" ? 6 : 5,
      };
      return {
        totalCount: failure === "incomplete final total" ? 6 : 5,
        keepCount: failure === "incomplete final total" ? 6 : 5,
        deleteCount: 0,
        hash:
          failure === "changed snapshot hash" ? "d".repeat(64) : "c".repeat(64),
        rows: [finalRow],
        referenceDetailsByStableId: {},
        nextCursor: null,
      };
    });
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    await user.click(
      await screen.findByRole("button", { name: "Cargar manifiesto" }),
    );

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Hash:/)).not.toBeInTheDocument();
  });

  function readinessRows(): DriveReadinessManifestRow[] {
    const canonical = [
      ["1HfBYmn3WNhvSY9Iz7DaQIdzXDCihmdfq", "SIG"],
      ["1ih2MD9nA_JJ2gDlQlznGr1rmiRAFEv4r", "2026"],
      ["1jYsfYMsGM7vPOPO_YqohEcOGJWnHS6Ng", "2026/01.Enero"],
      ["12YGBPNRV6hmxqJGqJRtHCyieUZfwJMIX", "2026/01.Enero/NO-ASIGNADOS"],
    ].map(([stableId, relativePath], index) => ({
      sequence: index + 1,
      stableId,
      relativePath,
      itemType: "FOLDER",
      disposition: "KEEP" as const,
      reasonCode: "CANONICAL_REQUIRED",
      referenceStatus: "CANONICAL" as const,
    }));
    return [
      ...canonical,
      ...Array.from({ length: 70 }, (_, index) => ({
        sequence: index + 5,
        stableId: `legacy-item-${String(index + 1).padStart(2, "0")}`,
        relativePath: `legacy/${index + 1}`,
        itemType: "FOLDER",
        disposition: "KEEP" as const,
        reasonCode: "REVIEW_REQUIRED",
        referenceStatus: "CLEAR" as const,
      })),
    ];
  }

  function mockPagedReadiness() {
    const rows = readinessRows();
    mocks.getReadinessManifest.mockImplementation(
      async (cursor: number, limit: number) => ({
        totalCount: 74,
        keepCount: 74,
        deleteCount: 0,
        hash: "c".repeat(64),
        rows: rows.slice(cursor, cursor + limit),
        referenceDetailsByStableId: {},
        nextCursor: cursor + limit < rows.length ? cursor + limit : null,
      }),
    );
  }

  async function loadAllReadinessPages(
    _user: ReturnType<typeof userEvent.setup>,
  ) {
    fireEvent.click(
      await screen.findByRole("button", { name: "Marcar página revisada" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Siguiente" }));
    await waitFor(() =>
      expect(mocks.getReadinessManifest).toHaveBeenCalledWith(
        25,
        25,
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Marcar página revisada" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() =>
      expect(mocks.getReadinessManifest).toHaveBeenCalledWith(
        50,
        25,
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Marcar página revisada" }),
    );
  }

  async function loadAllReadinessPagesWithoutReview(
    _user: ReturnType<typeof userEvent.setup>,
  ) {
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Cargar manifiesto",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Siguiente" }));
    await waitFor(() =>
      expect(mocks.getReadinessManifest).toHaveBeenCalledWith(
        25,
        25,
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() =>
      expect(mocks.getReadinessManifest).toHaveBeenCalledWith(
        50,
        25,
        expect.any(AbortSignal),
      ),
    );
  }

  it("confirms the local DELETE70 bulk decision while preserving and locking KEEP4", async () => {
    mocks.role = "GIOF_MANAGER";
    mockPagedReadiness();
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    await loadAllReadinessPagesWithoutReview(user);
    const bulkButton = screen.getByRole("button", {
      name: "Marcar los 70 no canónicos como DELETE",
    });
    await user.click(bulkButton);

    expect(
      screen.getByRole("heading", { name: "Confirmar decisión DELETE70" }),
    ).toBeInTheDocument();
    const cancelButton = screen.getByRole("button", { name: "Cancelar" });
    expect(cancelButton).toHaveFocus();
    await user.click(cancelButton);
    await waitFor(() => expect(bulkButton).toHaveFocus());
    expect(screen.getByText(/KEEP 74 · DELETE 0/)).toBeInTheDocument();

    await user.click(bulkButton);
    await user.click(
      screen.getByRole("button", { name: "Confirmar DELETE70" }),
    );

    await waitFor(() => expect(bulkButton).toHaveFocus());
    expect(
      screen.getByText(/KEEP 4 · DELETE 70 · total 74 · cobertura completa/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Páginas revisadas: 3\/3/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(await screen.findByLabelText("Decisión 1")).toBeDisabled();
    expect(screen.getByLabelText("Decisión 5")).toHaveValue("DELETE");
    expect(screen.getByLabelText("Motivo 5")).toHaveValue("CLIENT_REVIEWED");
    expect(screen.queryByLabelText("Referencia 5")).not.toBeInTheDocument();
  }, 10_000);

  it("blocks registration and CSV export when a selected DELETE has a system reference blocker", async () => {
    mocks.role = "GIOF_MANAGER";
    const rows = readinessRows();
    rows[4] = {
      ...rows[4],
      referenceStatus: "BLOCKED",
      referenceDetails: [
        {
          code: "REFERENCE_PRESENT",
          sourceType: "PAYMENT_REQUEST",
          sourceId: "request-1",
        },
      ],
    };
    mocks.getReadinessManifest.mockImplementation(
      async (cursor: number, limit: number) => ({
        totalCount: 74,
        keepCount: 74,
        deleteCount: 0,
        hash: "c".repeat(64),
        rows: rows.slice(cursor, cursor + limit),
        referenceDetailsByStableId: Object.fromEntries(
          rows.slice(cursor, cursor + limit).map((row) => [
            row.stableId,
            row.stableId === "legacy-item-01"
              ? [
                  {
                    code: "REFERENCE_PRESENT",
                    sourceType: "PAYMENT_REQUEST",
                    sourceId: "request-1",
                  },
                ]
              : [],
          ]),
        ),
        nextCursor: cursor + limit < rows.length ? cursor + limit : null,
      }),
    );
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    await loadAllReadinessPagesWithoutReview(user);
    await user.click(
      screen.getByRole("button", {
        name: "Marcar los 70 no canónicos como DELETE",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar DELETE70" }),
    );
    fireEvent.change(
      screen.getByLabelText("Razón de la revisión del manifiesto"),
      { target: { value: "Revisión cliente" } },
    );

    expect(
      screen.getByText(/DELETE bloqueados por referencias: 1/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Exportar revisión local en CSV" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Registrar revisión del manifiesto" }),
    ).toBeDisabled();
  });

  it("confirms a dirty reset, discards all local review state and reloads fresh server defaults", async () => {
    mocks.role = "GIOF_MANAGER";
    mockPagedReadiness();
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    await loadAllReadinessPagesWithoutReview(user);
    await user.click(
      screen.getByRole("button", {
        name: "Marcar los 70 no canónicos como DELETE",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirmar DELETE70" }),
    );
    fireEvent.change(
      screen.getByLabelText("Razón de la revisión del manifiesto"),
      { target: { value: "Descartar también esta razón" } },
    );
    mocks.getReadinessManifest.mockClear();

    const resetButton = screen.getByRole("button", {
      name: "Restablecer revisión local",
    });
    await user.click(resetButton);
    expect(
      screen.getByRole("heading", {
        name: "Confirmar restablecimiento local",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
    await user.click(
      screen.getByRole("button", { name: "Confirmar restablecimiento" }),
    );

    await waitFor(() =>
      expect(mocks.getReadinessManifest).toHaveBeenCalledTimes(3),
    );
    await waitFor(() => expect(resetButton).toHaveFocus());
    expect(
      screen.getByText(/KEEP 74 · DELETE 0 · total 74 · cobertura completa/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Páginas revisadas: 0\/3/)).toBeInTheDocument();
    expect(
      screen.getByLabelText("Razón de la revisión del manifiesto"),
    ).toHaveValue("");
  });

  it("keeps canonical decisions locked and submits all editable pages with a candidate hash", async () => {
    mocks.role = "GIOF_MANAGER";
    mockPagedReadiness();
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    await user.click(
      await screen.findByRole("button", {
        name: "Cargar manifiesto",
      }),
    );
    expect(screen.getByLabelText("Decisión 1")).toBeDisabled();
    expect(screen.getByText(/Páginas revisadas: 0\/3/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Decisión 5"), "DELETE");
    expect(
      screen.getByText(/KEEP 73 · DELETE 1 · total 74 · cobertura completa/),
    ).toBeInTheDocument();
    await loadAllReadinessPages(user);
    expect(screen.getByText(/Ítems cargados: 74\/74/)).toBeInTheDocument();
    expect(screen.getByText(/Páginas revisadas: 3\/3/)).toBeInTheDocument();
    expect(
      screen.getByText(/KEEP 73 · DELETE 1 · total 74 · cobertura completa/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(
      screen.getByText(/KEEP 73 · DELETE 1 · total 74 · cobertura completa/),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("Razón de la revisión del manifiesto"),
      { target: { value: "Revisión cliente completa" } },
    );
    await user.click(
      screen.getByRole("button", { name: "Registrar revisión del manifiesto" }),
    );

    await waitFor(() =>
      expect(mocks.reviewReadinessManifest).toHaveBeenCalledTimes(1),
    );
    const payload = mocks.reviewReadinessManifest.mock.calls[0][0];
    expect(payload.expectedHash).toBe("c".repeat(64));
    expect(payload.decisions).toHaveLength(74);
    expect(payload.decisions[0]).toEqual(
      expect.objectContaining({
        disposition: "KEEP",
        reasonCode: "CANONICAL_REQUIRED",
      }),
    );
    expect(payload.decisions[4]).toEqual(
      expect.objectContaining({ disposition: "DELETE" }),
    );
    expect(payload.decisions[4]).not.toHaveProperty("referenceStatus");
    expect(payload.reason).toBe("Revisión cliente completa");
    expect(await screen.findByText(/Revisión registrada/)).toBeInTheDocument();
  });

  it("refetches the authoritative gate after review and enables FREEZE with only its persisted hash", async () => {
    mocks.role = "GIOF_MANAGER";
    mockPagedReadiness();
    mocks.getReadinessReconciliation
      .mockResolvedValueOnce({
        reconciled: false,
        frozen: false,
        manifest_hash: null,
        reconciliation_hash: null,
        freeze_authorization_id: null,
        baseline_absent: true,
      })
      .mockResolvedValueOnce({
        reconciled: true,
        frozen: false,
        manifest_hash: "e".repeat(64),
        reconciliation_hash: "r".repeat(64),
        freeze_authorization_id: null,
        baseline_absent: true,
      });
    render(<DriveHierarchyManagement />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Cargar manifiesto" }),
    );
    await loadAllReadinessPages(userEvent.setup());
    fireEvent.change(
      screen.getByLabelText("Razón de la revisión del manifiesto"),
      { target: { value: "Persistir y refrescar el gate" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar revisión del manifiesto" }),
    );

    await waitFor(() =>
      expect(mocks.getReadinessReconciliation).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByLabelText("Hash revisado para FREEZE")).toHaveValue(
      "e".repeat(64),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Revisión del manifiesto registrada sin ejecutar limpieza.",
    );

    fireEvent.change(screen.getByLabelText("ID de autorización FREEZE"), {
      target: { value: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    });
    fireEvent.change(screen.getByLabelText("Razón de FREEZE"), {
      target: { value: "Usar solo el hash persistido del servidor" },
    });
    const freezeButton = screen.getByRole("button", {
      name: "Ejecutar FREEZE",
    });
    expect(freezeButton).toBeEnabled();
    fireEvent.click(freezeButton);

    await waitFor(() =>
      expect(mocks.freezeReadiness).toHaveBeenCalledWith(
        {
          expectedHash: "e".repeat(64),
          authorizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          reason: "Usar solo el hash persistido del servidor",
        },
        expect.any(AbortSignal),
      ),
    );
    expect(mocks.freezeReadiness.mock.calls[0][0].expectedHash).not.toBe(
      "d".repeat(64),
    );
  });

  it("reports that review persisted when the authoritative status refresh fails", async () => {
    mocks.role = "GIOF_MANAGER";
    mockPagedReadiness();
    mocks.getReadinessReconciliation
      .mockResolvedValueOnce({
        reconciled: false,
        frozen: false,
        manifest_hash: null,
        reconciliation_hash: null,
        freeze_authorization_id: null,
        baseline_absent: true,
      })
      .mockRejectedValueOnce(new Error("status refresh failed"));
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    await user.click(
      await screen.findByRole("button", { name: "Cargar manifiesto" }),
    );
    await loadAllReadinessPages(user);
    fireEvent.change(
      screen.getByLabelText("Razón de la revisión del manifiesto"),
      { target: { value: "La revisión sí debe persistir" } },
    );
    await user.click(
      screen.getByRole("button", { name: "Registrar revisión del manifiesto" }),
    );

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        expect.stringMatching(
          /revisión se registró correctamente.*falló la actualización del estado persistido/i,
        ),
      ),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Revisión del manifiesto registrada sin ejecutar limpieza.",
    );
    expect(mocks.toastError).not.toHaveBeenCalledWith(
      expect.stringMatching(/No se registró ninguna revisión/i),
    );
    expect(await screen.findByText(/Revisión registrada/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ejecutar FREEZE" }),
    ).toBeDisabled();
  });

  it("exports the exact fully reviewed local decisions without registering them", async () => {
    mocks.role = "GIOF_MANAGER";
    mockPagedReadiness();
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    const exportButton = await screen.findByRole("button", {
      name: "Exportar revisión local en CSV",
    });
    expect(exportButton).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Cargar manifiesto" }));
    await user.selectOptions(screen.getByLabelText("Decisión 5"), "DELETE");
    await loadAllReadinessPages(user);
    expect(exportButton).toBeEnabled();
    await user.click(exportButton);

    await waitFor(() =>
      expect(mocks.downloadReadinessManifest).toHaveBeenCalledTimes(1),
    );
    const [payload] = mocks.downloadReadinessManifest.mock.calls[0];
    expect(payload.expectedHash).toBe("c".repeat(64));
    expect(payload.decisions).toHaveLength(74);
    expect(payload.decisions[4]).toEqual(
      expect.objectContaining({ disposition: "DELETE" }),
    );
    expect(payload.decisions[4]).not.toHaveProperty("referenceStatus");
    expect(mocks.reviewReadinessManifest).not.toHaveBeenCalled();
  });

  it.each([
    [
      "stale source hash",
      new ApiRequestError(409, {
        statusCode: 409,
        message: "Readiness review hash is stale",
        error: "Conflict",
        timestamp: new Date().toISOString(),
        path: "/drive-hierarchy/readiness/manifest.csv",
      }),
      /hash quedó obsoleto/,
    ],
    [
      "malformed successful response",
      new ApiRequestError(200, {
        statusCode: 200,
        code: "INVALID_DOWNLOAD_RESPONSE",
        message: "Invalid download response",
        error: "Invalid Download Response",
        timestamp: new Date().toISOString(),
        path: "/drive-hierarchy/readiness/manifest.csv",
      }),
      /Invalid download response.*Código técnico: INVALID_DOWNLOAD_RESPONSE/,
    ],
  ])(
    "keeps local decisions when CSV export rejects a %s",
    async (_name, error, message) => {
      mocks.role = "GIOF_MANAGER";
      mockPagedReadiness();
      mocks.downloadReadinessManifest.mockRejectedValueOnce(error);
      const user = userEvent.setup();
      render(<DriveHierarchyManagement />);

      await user.click(
        await screen.findByRole("button", {
          name: "Cargar manifiesto",
        }),
      );
      await user.selectOptions(screen.getByLabelText("Decisión 5"), "DELETE");
      await loadAllReadinessPages(user);
      await user.click(
        screen.getByRole("button", { name: "Exportar revisión local en CSV" }),
      );

      await waitFor(() =>
        expect(mocks.toastError).toHaveBeenCalledWith(
          expect.stringMatching(message),
        ),
      );
      await user.click(screen.getByRole("button", { name: "Anterior" }));
      await user.click(screen.getByRole("button", { name: "Anterior" }));
      expect(await screen.findByLabelText("Decisión 5")).toHaveValue("DELETE");
      expect(mocks.reviewReadinessManifest).not.toHaveBeenCalled();
    },
    10_000,
  );

  it.each([
    [
      "stale hash",
      new ApiRequestError(409, {
        statusCode: 409,
        code: "DRIVE_READINESS_REVIEW_STALE",
        message: "Readiness review hash is stale",
        error: "Conflict",
        timestamp: new Date().toISOString(),
        path: "/drive-hierarchy/readiness/manifest/review",
        retryable: false,
      }),
      /hash quedó obsoleto/,
    ],
    [
      "non-conflict API response",
      new ApiRequestError(500, {
        statusCode: 500,
        code: "DRIVE_READINESS_REVIEW_INVALID",
        message: "La revisión no cumple el contrato dinámico de base de datos",
        error: "Internal Server Error",
        timestamp: new Date().toISOString(),
        path: "/drive-hierarchy/readiness/manifest/review",
        retryable: false,
      }),
      /La revisión no cumple el contrato dinámico.*Código técnico: DRIVE_READINESS_REVIEW_INVALID/,
    ],
    [
      "atomic server error",
      new Error("server failed"),
      /No se registró ninguna revisión/,
    ],
  ])("preserves edits and reason after %s", async (_name, error, message) => {
    mocks.role = "GIOF_MANAGER";
    mockPagedReadiness();
    mocks.reviewReadinessManifest.mockRejectedValueOnce(error);
    render(<DriveHierarchyManagement />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Cargar manifiesto",
      }),
    );
    fireEvent.change(await screen.findByLabelText("Decisión 5"), {
      target: { value: "DELETE" },
    });
    await loadAllReadinessPages(userEvent.setup());
    fireEvent.change(
      screen.getByLabelText("Razón de la revisión del manifiesto"),
      { target: { value: "Conservar esta razón" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Registrar revisión del manifiesto" }),
    );

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        expect.stringMatching(message),
      ),
    );
    expect(
      screen.getByLabelText("Razón de la revisión del manifiesto"),
    ).toHaveValue("Conservar esta razón");
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(await screen.findByLabelText("Decisión 5")).toHaveValue("DELETE");
    expect(screen.queryByText(/Revisión registrada/)).not.toBeInTheDocument();
  }, 10_000);

  it("previews and explicitly captures the initial ACL baseline", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getNodes.mockResolvedValue([
      {
        id: "canary",
        logical_key: `U:${new Date().getFullYear()}:01`,
        last_error_at: null,
      },
    ]);
    mocks.preflight.mockResolvedValue({
      passes: false,
      issues: ["ACL_BASELINE_MISSING"],
      guidance: ["Preview and capture the initial baseline."],
    });
    mocks.previewAclBaseline.mockResolvedValue({
      rootFolderId: "1HfBYmn3WNhvSY9Iz7DaQIdzXDCihmdfq",
      sharedDriveId: "0AMDqYiaJ9dfnUk9PVA",
      rootRevision: 1,
      complete: true,
      nodeCount: 71,
      inventoryHash: "a".repeat(64),
      manifestHash: "m".repeat(64),
      reconciliationHash: "r".repeat(64),
      freezeAuthorizationId: "freeze-auth",
      directGrantCount: 2,
      topologyHash: "t".repeat(64),
      aclHash: "d".repeat(64),
      previewToken: "preview-a",
    });
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    await user.click(
      await screen.findByRole("button", { name: "Previsualizar baseline ACL" }),
    );
    expect(screen.getByText(/71 nodos/)).toBeInTheDocument();
    mocks.previewAclBaseline.mockResolvedValueOnce({
      ...(await mocks.previewAclBaseline.mock.results[0].value),
      previewToken: "preview-b",
    });
    await user.click(
      screen.getByRole("button", { name: "Previsualizar baseline ACL" }),
    );
    expect(screen.getByText(/2\/2/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copiar datos para emisión CAPTURE" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Capturar baseline inicial" }),
    );
    fireEvent.change(screen.getByLabelText("Razón de la operación"), {
      target: { value: "Apruebo preservar el ACL actual" },
    });
    fireEvent.change(screen.getByLabelText("ID de autorización para captura"), {
      target: { value: "capture-auth" },
    });
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(mocks.captureAclBaseline).toHaveBeenCalledWith(
        {
          reason: "Apruebo preservar el ACL actual",
          confirmCapture: true,
          expectedInventoryHash: "a".repeat(64),
          expectedManifestHash: "m".repeat(64),
          authorizationId: "capture-auth",
          previewTokens: ["preview-a", "preview-b"],
        },
        expect.any(AbortSignal),
      ),
    );
  });

  it("keeps CAPTURE handoff and execution disabled when preview context differs", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getNodes.mockResolvedValue([
      {
        id: "canary",
        logical_key: `U:${new Date().getFullYear()}:01`,
        last_error_at: null,
      },
    ]);
    mocks.previewAclBaseline
      .mockResolvedValueOnce(ACL_PREVIEW)
      .mockResolvedValueOnce({
        ...ACL_PREVIEW,
        manifestHash: "n".repeat(64),
        previewToken: "preview-b",
      });
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    const previewButton = await screen.findByRole("button", {
      name: "Previsualizar baseline ACL",
    });
    await user.click(previewButton);
    await user.click(previewButton);

    expect(await screen.findByText(/1\/2/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Copiar datos para emisión CAPTURE",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Capturar baseline inicial" }),
    ).toBeDisabled();
  });

  it("shows reconciliation progress, blocks premature baseline preview, and explains the sequence", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getNodes.mockResolvedValue([
      {
        id: "canary",
        logical_key: `U:${new Date().getFullYear()}:01`,
        last_error_at: null,
      },
    ]);
    mocks.getReadinessReconciliation.mockResolvedValue({
      reconciled: false,
      frozen: false,
      manifest_hash: "c".repeat(64),
      baseline_absent: true,
    });

    render(<DriveHierarchyManagement />);

    expect(
      await screen.findByText(/Revisar → reconciliar → congelar/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reconciliación pendiente/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previsualizar baseline ACL" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/baseline permanece bloqueado/i),
    ).toBeInTheDocument();
  });

  it("fails closed on fresh reload when there is no persisted review", async () => {
    mocks.role = "GIOF_MANAGER";
    const noReview: DriveReadinessReconciliation = {
      reconciled: false,
      frozen: false,
      manifest_hash: null,
      reconciliation_hash: null,
      freeze_authorization_id: null,
      baseline_absent: true,
    };
    mocks.getReadinessReconciliation.mockResolvedValue(noReview);

    render(<DriveHierarchyManagement />);

    expect(await screen.findByText("Revisión pendiente")).toBeInTheDocument();
    expect(screen.getByText("Reconciliación pendiente")).toBeInTheDocument();
    expect(screen.getByText("FREEZE pendiente")).toBeInTheDocument();
    expect(screen.getByLabelText("Hash revisado para FREEZE")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "Ejecutar FREEZE" }),
    ).toBeDisabled();
  });

  it("hydrates a persisted frozen gate on fresh reload", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getReadinessReconciliation.mockResolvedValue({
      reconciled: true,
      frozen: true,
      manifest_hash: "f".repeat(64),
      reconciliation_hash: "r".repeat(64),
      freeze_authorization_id: "persisted-freeze-authorization",
      baseline_absent: true,
    });

    render(<DriveHierarchyManagement />);

    expect(await screen.findByText("Manifiesto revisado")).toBeInTheDocument();
    expect(screen.getByText("Reconciliación completa")).toBeInTheDocument();
    expect(screen.getByText("Topología congelada")).toBeInTheDocument();
    expect(screen.getByLabelText("Hash revisado para FREEZE")).toHaveValue(
      "f".repeat(64),
    );
    expect(
      screen.getByRole("button", { name: "Ejecutar FREEZE" }),
    ).toBeDisabled();
  });

  it("hydrates persisted review and freeze state when the role switches to manager", async () => {
    mocks.role = "AUDITOR_DIRECCION";
    mocks.getReadinessReconciliation.mockClear();
    const view = render(<DriveHierarchyManagement />);
    await screen.findByText("PREPARING");
    expect(screen.getByText(/Vista de solo lectura/)).toBeInTheDocument();
    expect(mocks.getReadinessReconciliation).not.toHaveBeenCalled();

    mocks.getReadinessReconciliation.mockResolvedValue({
      reconciled: true,
      frozen: true,
      manifest_hash: "e".repeat(64),
      reconciliation_hash: "r".repeat(64),
      freeze_authorization_id: "role-switch-freeze",
      baseline_absent: true,
    });
    mocks.role = "GIOF_MANAGER";
    view.rerender(<DriveHierarchyManagement />);

    expect(await screen.findByText("Manifiesto revisado")).toBeInTheDocument();
    expect(screen.getByText("Topología congelada")).toBeInTheDocument();
    expect(mocks.getReadinessReconciliation).toHaveBeenCalledTimes(1);
  });

  it("lets the exact target manager execute FREEZE with the reviewed hash prefilled", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getReadinessReconciliation.mockResolvedValue({
      reconciled: true,
      frozen: false,
      manifest_hash: "f".repeat(64),
      reconciliation_hash: "r".repeat(64),
      baseline_absent: true,
    });
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    const hash = await screen.findByLabelText("Hash revisado para FREEZE");
    expect(hash).toHaveValue("f".repeat(64));
    expect(hash).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText("ID de autorización FREEZE"), {
      target: { value: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    });
    fireEvent.change(screen.getByLabelText("Razón de FREEZE"), {
      target: { value: "Reconciliación revisada por el gestor objetivo" },
    });
    await user.click(screen.getByRole("button", { name: "Ejecutar FREEZE" }));

    await waitFor(() =>
      expect(mocks.freezeReadiness).toHaveBeenCalledWith(
        {
          expectedHash: "f".repeat(64),
          authorizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          reason: "Reconciliación revisada por el gestor objetivo",
        },
        expect.any(AbortSignal),
      ),
    );
  });

  it("enables READY only with seven valid evidence IDs and consumes through lifecycle", async () => {
    mocks.role = "GIOF_MANAGER";
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    const readyButton = await screen.findByRole("button", {
      name: "Marcar READY",
    });
    expect(readyButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Evidencias READY para consumo"), {
      target: { value: READY_EVIDENCE_IDS.slice(0, 7).join(",") },
    });
    fireEvent.change(screen.getByLabelText("ID de autorización READY"), {
      target: { value: "20000000-0000-4000-8000-000000000001" },
    });
    fireEvent.change(screen.getByLabelText("Razón de READY"), {
      target: { value: "Siete evidencias verificadas" },
    });
    expect(readyButton).toBeEnabled();
    await user.click(readyButton);

    await waitFor(() =>
      expect(mocks.transition).toHaveBeenCalledWith(
        {
          status: "READY",
          reason: "Siete evidencias verificadas",
          evidenceRunIds: READY_EVIDENCE_IDS.slice(0, 7),
          authorizationId: "20000000-0000-4000-8000-000000000001",
        },
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.queryByRole("button", { name: /ACTIVE/i }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["six IDs", READY_EVIDENCE_IDS.slice(0, 6)],
    ["eight IDs", READY_EVIDENCE_IDS],
    [
      "duplicate IDs",
      [...READY_EVIDENCE_IDS.slice(0, 6), READY_EVIDENCE_IDS[0]],
    ],
    ["a malformed UUID", [...READY_EVIDENCE_IDS.slice(0, 6), "not-a-uuid"]],
  ])("keeps READY disabled for %s", async (_name, evidenceIds) => {
    mocks.role = "GIOF_MANAGER";
    render(<DriveHierarchyManagement />);

    const readyButton = await screen.findByRole("button", {
      name: "Marcar READY",
    });
    fireEvent.change(screen.getByLabelText("Evidencias READY para consumo"), {
      target: { value: evidenceIds.join(",") },
    });
    fireEvent.change(screen.getByLabelText("ID de autorización READY"), {
      target: { value: "20000000-0000-4000-8000-000000000001" },
    });
    fireEvent.change(screen.getByLabelText("Razón de READY"), {
      target: { value: "Validación negativa" },
    });

    expect(readyButton).toBeDisabled();
    expect(mocks.transition).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "READY" }),
      expect.anything(),
    );
  });

  it("keeps the ACL preview active beyond 30 seconds and times it out at 2 minutes", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getNodes.mockResolvedValue([
      {
        id: "canary",
        logical_key: `U:${new Date().getFullYear()}:01`,
        last_error_at: null,
      },
    ]);
    let previewSignal: AbortSignal | undefined;
    mocks.previewAclBaseline.mockImplementation(
      (signal: AbortSignal | undefined) => {
        previewSignal = signal;
        return new Promise(() => undefined);
      },
    );
    render(<DriveHierarchyManagement />);

    const previewButton = await screen.findByRole("button", {
      name: "Previsualizar baseline ACL",
    });
    vi.useFakeTimers();
    fireEvent.click(previewButton);

    const progressButton = screen.getByRole("button", {
      name: "Inventariando permisos… puede tardar hasta 2 minutos",
    });
    expect(progressButton).toBeDisabled();
    expect(progressButton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Inventariando permisos… puede tardar hasta 2 minutos",
    );

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(previewSignal?.aborted).toBe(false);
    expect(mocks.toastError).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(previewSignal?.aborted).toBe(true);
    expect(mocks.toastError).toHaveBeenCalledWith(
      "La operación tardó demasiado y fue cancelada. No se aplicaron cambios en la base de datos; puedes intentarlo nuevamente.",
    );
    expect(
      screen.getByRole("button", { name: "Previsualizar baseline ACL" }),
    ).toBeEnabled();
    vi.useRealTimers();
  });

  it("keeps ACL capture locked and busy until its 2-minute timeout", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getNodes.mockResolvedValue([
      {
        id: "canary",
        logical_key: `U:${new Date().getFullYear()}:01`,
        last_error_at: null,
      },
    ]);
    mocks.previewAclBaseline.mockResolvedValue({
      rootFolderId: "root-id",
      sharedDriveId: "shared-drive-id",
      rootRevision: 1,
      complete: true,
      nodeCount: 74,
      inventoryHash: "b".repeat(64),
      manifestHash: "m".repeat(64),
      reconciliationHash: "r".repeat(64),
      freezeAuthorizationId: "freeze-auth",
      directGrantCount: 0,
      topologyHash: "t".repeat(64),
      aclHash: "d".repeat(64),
      previewToken: "preview-a",
    });
    let captureSignal: AbortSignal | undefined;
    mocks.captureAclBaseline.mockImplementation(
      (_input: unknown, signal: AbortSignal | undefined) => {
        captureSignal = signal;
        return new Promise(() => undefined);
      },
    );
    render(<DriveHierarchyManagement />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Previsualizar baseline ACL",
      }),
    );
    mocks.previewAclBaseline.mockResolvedValueOnce({
      rootFolderId: "root-id",
      sharedDriveId: "shared-drive-id",
      rootRevision: 1,
      complete: true,
      nodeCount: 74,
      inventoryHash: "b".repeat(64),
      manifestHash: "m".repeat(64),
      reconciliationHash: "r".repeat(64),
      freezeAuthorizationId: "freeze-auth",
      directGrantCount: 0,
      topologyHash: "t".repeat(64),
      aclHash: "d".repeat(64),
      previewToken: "preview-b",
    });
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Previsualizar baseline ACL",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Capturar baseline inicial" }),
    );
    fireEvent.change(screen.getByLabelText("Razón de la operación"), {
      target: { value: "Captura aprobada" },
    });
    fireEvent.change(screen.getByLabelText("ID de autorización para captura"), {
      target: { value: "capture-auth-timeout" },
    });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    const confirmButton = screen.getByRole("button", {
      name: "Inventariando permisos… puede tardar hasta 2 minutos",
    });
    expect(confirmButton).toBeDisabled();
    expect(confirmButton).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Razón de la operación")).toBeDisabled();

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(captureSignal?.aborted).toBe(false);

    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(captureSignal?.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled();
    vi.useRealTimers();
  });

  it("deduplicates double clicks and disables every conflicting action immediately", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getRoot.mockResolvedValue({
      registered: false,
      legacyBehavior: true,
      configuredRootId: "sig-id",
      root: null,
    });
    let resolvePreflight!: (value: {
      passes: boolean;
      issues: string[];
      guidance: string[];
    }) => void;
    mocks.preflight.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreflight = resolve;
        }),
    );
    render(<DriveHierarchyManagement />);

    const button = await screen.findByRole("button", {
      name: "Ejecutar preflight",
    });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.preflight).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Verificando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(mocks.getRoot).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Registrar como PREPARING" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Verificando…" }),
    ).toHaveAttribute("aria-busy", "true");

    resolvePreflight({ passes: true, issues: [], guidance: [] });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Ejecutar preflight" }),
      ).toBeEnabled(),
    );
  });

  it("times out, ignores the stale response, and permits a clean retry", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getRoot.mockResolvedValue({
      registered: false,
      legacyBehavior: true,
      configuredRootId: "sig-id",
      root: null,
    });
    let resolveStale!: (value: {
      passes: boolean;
      issues: string[];
      guidance: string[];
    }) => void;
    mocks.preflight
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStale = resolve;
          }),
      )
      .mockResolvedValueOnce({
        passes: false,
        issues: ["ACL_BASELINE_MISSING"],
        guidance: [],
      });
    render(<DriveHierarchyManagement />);
    const button = await screen.findByRole("button", {
      name: "Ejecutar preflight",
    });
    vi.useFakeTimers();
    fireEvent.click(button);

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(mocks.toastError).toHaveBeenCalledWith(
      "La operación tardó demasiado y fue cancelada. No se aplicaron cambios en la base de datos; puedes intentarlo nuevamente.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Ejecutar preflight" }));
    await act(async () => Promise.resolve());
    resolveStale({ passes: true, issues: [], guidance: [] });
    await act(async () => Promise.resolve());

    expect(
      screen.getByText(/El baseline ACL todavía no fue capturado/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Preflight aprobado")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("restores controls and preserves the actionable owner-capability reason", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getRoot.mockResolvedValue({
      registered: false,
      legacyBehavior: true,
      configuredRootId: "sig-id",
      root: null,
    });
    mocks.preflight.mockRejectedValueOnce(
      new ApiRequestError(503, {
        statusCode: 503,
        code: "DRIVE_OWNER_CAPABILITY_SQL_UNAVAILABLE",
        message:
          "No se completó el registro PREPARING y no se aplicaron cambios en la base de datos. La capacidad SQL instalada está desactualizada.",
        error: "Drive owner capability unavailable",
        timestamp: new Date().toISOString(),
        path: "/drive-hierarchy/preflight",
        retryable: true,
      }),
    );
    render(<DriveHierarchyManagement />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Ejecutar preflight" }),
    );
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        expect.stringMatching(
          /no se aplicaron cambios.*Conserva la razón.*Código técnico: DRIVE_OWNER_CAPABILITY_SQL_UNAVAILABLE/i,
        ),
      ),
    );
    expect(
      screen.getByRole("button", { name: "Ejecutar preflight" }),
    ).toBeEnabled();
  });

  it("orders PREPARING canary before the explicit ACL flow", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getNodes.mockResolvedValue([]);
    render(<DriveHierarchyManagement />);

    expect(
      await screen.findByText(
        /Siguiente paso: previsualiza y confirma el canary seguro/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Previsualizar baseline ACL" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Canary seguro/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Canary seguro/ }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Previsualizar sin mutar" }),
    ).toBeEnabled();
  });

  it("starts a fresh initial read after the StrictMode cleanup generation", async () => {
    mocks.role = "AUDITOR_DIRECCION";
    const signals: AbortSignal[] = [];
    mocks.getRoot.mockImplementation((signal: AbortSignal) => {
      signals.push(signal);
      return Promise.resolve({
        registered: true,
        legacyBehavior: false,
        root: {
          id: "root-node",
          lifecycle_status: "PREPARING",
          drive_folder_id: "root-id",
        },
      });
    });

    render(
      <StrictMode>
        <DriveHierarchyManagement />
      </StrictMode>,
    );

    expect((await screen.findAllByText("PREPARING")).length).toBeGreaterThan(0);
    expect(mocks.getRoot).toHaveBeenCalledTimes(2);
    expect(mocks.getNodes).toHaveBeenCalledTimes(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("silently aborts pending initial reads on unmount", async () => {
    mocks.role = "AUDITOR_DIRECCION";
    const signals: AbortSignal[] = [];
    mocks.getRoot.mockImplementation((signal: AbortSignal) => {
      signals.push(signal);
      return new Promise(() => undefined);
    });
    mocks.getNodes.mockImplementation(() => new Promise(() => undefined));

    const view = render(<DriveHierarchyManagement />);
    await waitFor(() => expect(signals).toHaveLength(1));
    view.unmount();

    expect(signals[0]?.aborted).toBe(true);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("commits root and nodes while manager health remains delayed", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getNodes.mockResolvedValue([
      {
        id: "known-node",
        node_kind: "YEAR",
        name: "2026",
        drive_folder_id: "year-id",
        version: 1,
        last_error_at: null,
      },
    ]);
    mocks.getPaymentProjectionHealth.mockImplementation(
      () => new Promise(() => undefined),
    );

    render(<DriveHierarchyManagement />);

    expect((await screen.findAllByText("PREPARING")).length).toBeGreaterThan(0);
    expect(screen.getByText("Nodos y errores (1)")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(
      screen.getByText("Cargando salud de proyecciones..."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Worker deshabilitado/)).not.toBeInTheDocument();
  });

  it("shows automatic auditor admission and no renewable worker action", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getPaymentProjectionHealth.mockResolvedValue({
      workerEnabled: true,
      lifecycleStatus: "ACTIVE",
      active: true,
      operationalReasons: [],
      counts: {
        SOURCE_REQUIRED: 0,
        PENDING: 1,
        PROCESSING: 2,
        SUCCEEDED: 3,
        FAILED: 1,
      },
      eligibleCount: 4,
      dueCount: 1,
      oldestEligibleAt: null,
      oldestEligibleLagSeconds: null,
      oldestDueAt: null,
      errors: [],
      auditor: {
        status: "PASS",
        generation: 12,
        rootRevision: "7",
        observedAt: "2026-08-25T10:00:00.000Z",
        expiresAt: "2026-08-25T10:15:00.000Z",
        ageSeconds: 20,
        issueCodes: [],
        auditedCount: 25,
        frozenCount: 0,
        wireAttempts: 26,
      },
      callBudget: { normal: 1, maximum: 2, lastBatchMaximum: 2 },
    });

    render(<DriveHierarchyManagement />);

    expect(await screen.findByText("Auditor saludable")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Renovar autorización del worker/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps successful hierarchy data when manager health fails", async () => {
    mocks.role = "GIOF_MANAGER";
    mocks.getPaymentProjectionHealth.mockRejectedValue(
      new ApiRequestError(400, {
        statusCode: 400,
        message: "health unavailable",
        error: "Bad Request",
        timestamp: new Date().toISOString(),
        path: "/drive-hierarchy/payment-projections/health",
      }),
    );

    render(<DriveHierarchyManagement />);

    expect((await screen.findAllByText("PREPARING")).length).toBeGreaterThan(0);
    expect(screen.getByText("Nodos y errores (0)")).toBeInTheDocument();
    expect(
      await screen.findByText(
        "No se pudo cargar la salud de las proyecciones de pago. No se modificaron datos.",
      ),
    ).toBeInTheDocument();
    expect(mocks.getPaymentProjectionHealth).toHaveBeenCalledTimes(1);
  });

  it("shows unknown root state and read-specific copy after a genuine timeout", async () => {
    mocks.role = "AUDITOR_DIRECCION";
    mocks.getRoot.mockImplementation(() => new Promise(() => undefined));
    vi.useFakeTimers();
    render(<DriveHierarchyManagement />);

    expect(screen.queryByText(/SIN RAÍZ/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/automatización de movimiento/),
    ).not.toBeInTheDocument();

    await act(async () => vi.advanceTimersByTimeAsync(60_000));

    expect(mocks.getRoot).toHaveBeenCalledTimes(2);
    expect(
      screen.getByText(
        "No se pudo cargar el estado de la jerarquía. No se modificaron datos.",
      ),
    ).toBeInTheDocument();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "No se pudo cargar el estado de la jerarquía. No se modificaron datos.",
    );
    expect(mocks.toastError).not.toHaveBeenCalledWith(
      expect.stringContaining("No se aplicaron cambios en la base de datos"),
    );
    expect(screen.queryByText(/SIN RAÍZ/)).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("retries a transient read only once and suppresses the stale first response", async () => {
    mocks.role = "AUDITOR_DIRECCION";
    let resolveStale!: (value: unknown) => void;
    mocks.getRoot
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStale = resolve;
          }),
      )
      .mockResolvedValueOnce({
        registered: true,
        legacyBehavior: false,
        root: {
          id: "new-root",
          lifecycle_status: "PAUSED",
          drive_folder_id: "new-root-id",
        },
      });
    vi.useFakeTimers();
    render(<DriveHierarchyManagement />);

    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(mocks.getRoot).toHaveBeenCalledTimes(2);
    expect(screen.getByText("PAUSED")).toBeInTheDocument();

    resolveStale({
      registered: true,
      legacyBehavior: false,
      root: {
        id: "stale-root",
        lifecycle_status: "PREPARING",
        drive_folder_id: "stale-root-id",
      },
    });
    await act(async () => Promise.resolve());

    expect(screen.getByText("PAUSED")).toBeInTheDocument();
    expect(screen.queryByText("PREPARING")).not.toBeInTheDocument();
    expect(mocks.toastError).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not request manager health for a non-manager while reads retry", async () => {
    mocks.role = "AUDITOR_DIRECCION";
    mocks.getRoot.mockRejectedValue(new TypeError("network unavailable"));
    render(<DriveHierarchyManagement />);

    await waitFor(() => expect(mocks.getRoot).toHaveBeenCalledTimes(2));
    expect(mocks.getPaymentProjectionHealth).not.toHaveBeenCalled();
    expect(screen.queryByText("Proyecciones de pago")).not.toBeInTheDocument();
  });

  it("lets an auditor issue and revoke FREEZE without exposing execution or sensitive target fields", async () => {
    mocks.role = "AUDITOR_DIRECCION";
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    await screen.findByText("PREPARING");
    expect(await screen.findByText("Gestora Segura")).toBeInTheDocument();
    const purpose = screen.getByRole("combobox", {
      name: "Propósito de autorización",
    });
    expect(purpose).toBeEnabled();
    expect(purpose).toHaveTextContent("FREEZE");
    expect(purpose).not.toHaveTextContent("READY");
    expect(
      screen.getByRole("combobox", { name: "Gestor objetivo" }),
    ).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Hash del manifiesto autorizado"), {
      target: { value: "a".repeat(64) },
    });
    fireEvent.change(screen.getByLabelText("Razón de autorización"), {
      target: { value: "Separación revisada" },
    });
    const issueButton = screen.getByRole("button", {
      name: "Emitir autorización",
    });
    await waitFor(() => expect(issueButton).toBeEnabled());
    await user.click(issueButton);

    await waitFor(() =>
      expect(mocks.issueReadinessAuthorization).toHaveBeenCalledWith(
        {
          purpose: "FREEZE",
          targetActorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          reason: "Separación revisada",
          manifestHash: "a".repeat(64),
        },
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.getByRole("button", { name: "Copiar ID" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Ejecutar FREEZE|Marcar READY/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/@|DNI|auth_source/i)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Revocar autorización" }),
    );
    await waitFor(() =>
      expect(mocks.revokeReadinessAuthorization).toHaveBeenCalledWith(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "Separación revisada",
        expect.any(AbortSignal),
      ),
    );
  });

  it("issues CAPTURE with only the exact target, reason, hashes, and two preview tokens", async () => {
    mocks.role = "AUDITOR_DIRECCION";
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);

    const purpose = await screen.findByRole("combobox", {
      name: "Propósito de autorización",
    });
    await user.selectOptions(purpose, "CAPTURE");
    fireEvent.change(screen.getByLabelText("Hash del manifiesto autorizado"), {
      target: { value: "a".repeat(64) },
    });
    fireEvent.change(screen.getByLabelText("Hash del inventario autorizado"), {
      target: { value: "b".repeat(64) },
    });
    fireEvent.change(screen.getByLabelText("Tokens de preview autorizados"), {
      target: { value: "preview-a\npreview-b" },
    });
    fireEvent.change(screen.getByLabelText("Razón de autorización"), {
      target: { value: "Dos previews exactos revisados" },
    });
    await user.click(
      screen.getByRole("button", { name: "Emitir autorización" }),
    );

    await waitFor(() =>
      expect(mocks.issueReadinessAuthorization).toHaveBeenCalledWith(
        {
          purpose: "CAPTURE",
          targetActorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          reason: "Dos previews exactos revisados",
          manifestHash: "a".repeat(64),
          inventoryHash: "b".repeat(64),
          previewTokens: ["preview-a", "preview-b"],
        },
        expect.any(AbortSignal),
      ),
    );
  });

  it("issues READY with exactly seven evidence IDs and hides every execution control from ADMIN_SISTEMA", async () => {
    mocks.role = "ADMIN_SISTEMA";
    const user = userEvent.setup();
    render(<DriveHierarchyManagement />);
    const purpose = await screen.findByRole("combobox", {
      name: "Propósito de autorización",
    });
    expect(purpose).toHaveTextContent("READY");
    expect(purpose).not.toHaveTextContent("FREEZE");
    fireEvent.change(screen.getByLabelText("Evidencias READY autorizadas"), {
      target: { value: READY_EVIDENCE_IDS.slice(0, 7).join(",") },
    });
    fireEvent.change(screen.getByLabelText("Razón de autorización"), {
      target: { value: "Siete gates revisados por administración" },
    });
    await user.click(
      screen.getByRole("button", { name: "Emitir autorización" }),
    );

    await waitFor(() =>
      expect(mocks.issueReadinessAuthorization).toHaveBeenCalledWith(
        {
          purpose: "READY",
          targetActorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          reason: "Siete gates revisados por administración",
          evidenceRunIds: READY_EVIDENCE_IDS.slice(0, 7),
        },
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.queryByText("Preparación y consumo de autorizaciones"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Ejecutar FREEZE|Marcar READY|Capturar baseline/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows consumer controls but hides every issuer control from GIOF_MANAGER", async () => {
    mocks.role = "GIOF_MANAGER";
    render(<DriveHierarchyManagement />);

    expect(
      await screen.findByText("Preparación y consumo de autorizaciones"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Autorizaciones de preparación Drive"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Emitir autorización" }),
    ).not.toBeInTheDocument();
  });

  it("hides issuer and consumer controls from ordinary GIOF_GESTOR", () => {
    mocks.role = "GIOF_GESTOR";
    render(<DriveHierarchyManagement />);

    expect(mocks.getRoot).not.toHaveBeenCalled();
    expect(mocks.getNodes).not.toHaveBeenCalled();
    expect(mocks.getPaymentProjectionHealth).not.toHaveBeenCalled();
    expect(mocks.getReadinessReconciliation).not.toHaveBeenCalled();
    expect(mocks.getReadinessAuthorizationTargets).not.toHaveBeenCalled();
    expect(screen.queryByText("Raíz y ciclo de vida")).not.toBeInTheDocument();
    expect(screen.queryByText(/Nodos y errores/)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Autorizaciones de preparación Drive"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Preparación y consumo de autorizaciones"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /Ejecutar preflight|Cambiar estado|Emitir autorización|Ejecutar FREEZE|Marcar READY/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("never stores transient authorization IDs during issue, copy, revoke, or unmount", async () => {
    mocks.role = "AUDITOR_DIRECCION";
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const user = userEvent.setup();
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    const view = render(<DriveHierarchyManagement />);

    await screen.findByText("Gestora Segura");
    fireEvent.change(screen.getByLabelText("Hash del manifiesto autorizado"), {
      target: { value: "a".repeat(64) },
    });
    fireEvent.change(screen.getByLabelText("Razón de autorización"), {
      target: { value: "Mantener el token solo en memoria" },
    });
    await user.click(
      screen.getByRole("button", { name: "Emitir autorización" }),
    );
    await user.click(await screen.findByRole("button", { name: "Copiar ID" }));
    expect(clipboardWrite).toHaveBeenCalledWith(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    await user.click(
      screen.getByRole("button", { name: "Revocar autorización" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
      ).not.toBeInTheDocument(),
    );
    view.unmount();

    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });
});
