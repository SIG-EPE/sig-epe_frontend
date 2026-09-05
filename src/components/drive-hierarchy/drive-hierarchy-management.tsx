"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FolderTree,
  Info,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { driveHierarchyApi } from "@/lib/drive-hierarchy-api";
import { ApiRequestError } from "@/lib/api-client";
import { ROLE_CODE } from "@/lib/constants";
import { ROLE_CAPABILITY, hasRoleCapability } from "@/lib/role-capabilities";
import { useAuthStore } from "@/stores/auth-store";
import { PaymentTopologyRecoveryCard } from "./payment-topology-recovery-card";
import { ProjectionHealthSummary } from "./projection-health-summary";
import {
  DRIVE_HIERARCHY_LIFECYCLE,
  type DriveAclBaselinePreview,
  type DriveHierarchyLifecycle,
  type DriveHierarchyNode,
  type DriveHierarchyPreflight,
  type DriveHierarchyRootStatus,
  type DrivePaymentProjectionHealth,
  type DriveProvisionPlan,
  type DriveReadinessManifestPage,
  type DriveReadinessManifestRow,
  type DriveReadinessAuthorization,
  type DriveReadinessAuthorizationPurpose,
  type DriveReadinessAuthorizationTarget,
  type DriveReadinessReconciliation,
  type DriveReparentProofPlan,
  type DriveReparentProofRun,
  type DriveReparentProofStage,
  type DriveReadyEvidenceStatus,
  type DriveReparentProofAuthorization,
} from "@/types/drive-hierarchy";

const LIFECYCLE_OPTIONS = Object.values(DRIVE_HIERARCHY_LIFECYCLE).filter(
  (status) =>
    status !== DRIVE_HIERARCHY_LIFECYCLE.READY &&
    status !== DRIVE_HIERARCHY_LIFECYCLE.ACTIVE,
);

const OPERATION = {
  PREFLIGHT: "preflight",
  REGISTER: "register",
  PLAN: "plan",
  PROVISION: "provision",
  ACL_PREVIEW: "acl-preview",
  ACL_CAPTURE: "acl-capture",
  TRANSITION: "transition",
  PROJECTION_RETRY: "projection-retry",
  READINESS_MANIFEST: "readiness-manifest",
  READINESS_REVIEW: "readiness-review",
  READINESS_EXPORT: "readiness-export",
  AUTHORIZATION_ISSUE: "authorization-issue",
  AUTHORIZATION_REVOKE: "authorization-revoke",
  REPARENT_PLAN: "reparent-plan",
  REPARENT_AUTHORIZE: "reparent-authorize",
  REPARENT_RUN: "reparent-run",
  REPARENT_RECOVER: "reparent-recover",
  READY_STATUS: "ready-status",
  READY_BUNDLE: "ready-bundle",
} as const;

type Operation = (typeof OPERATION)[keyof typeof OPERATION];

const ACL_INVENTORY_PROGRESS =
  "Inventariando permisos… puede tardar hasta 2 minutos";

const OPERATION_LABEL: Record<Operation, string> = {
  preflight: "Verificando…",
  register: "Registrando…",
  plan: "Preparando vista previa…",
  provision: "Aplicando plan…",
  "acl-preview": ACL_INVENTORY_PROGRESS,
  "acl-capture": ACL_INVENTORY_PROGRESS,
  transition: "Cambiando estado…",
  "projection-retry": "Reintentando proyección…",
  "readiness-manifest": "Cargando manifiesto…",
  "readiness-review": "Registrando revisión…",
  "readiness-export": "Exportando CSV…",
  "authorization-issue": "Emitiendo autorización…",
  "authorization-revoke": "Revocando autorización…",
  "reparent-plan": "Validando plan sin mutar…",
  "reparent-authorize": "Emitiendo autorización de prueba…",
  "reparent-run": "Creando, moviendo, restaurando y limpiando…",
  "reparent-recover": "Ejecutando solo compensación…",
  "ready-status": "Actualizando evidencias…",
  "ready-bundle": "Produciendo bundle 0–7…",
};

const REQUEST_TIMEOUT_MS = 30_000;
const ACL_REQUEST_TIMEOUT_MS = 120_000;
const READINESS_PAGE_LIMIT = 25;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READY_POLL_INTERVAL_MS = 5_000;
const READY_POLL_RATE_LIMIT_FALLBACK_MS = 60_000;
const ACTIVE_PROOF_STAGES: ReadonlySet<DriveReparentProofStage> = new Set([
  "CLAIMED",
  "CREATE_INTENT",
  "CREATED",
  "MOVE_TEMP_INTENT",
  "AT_TEMP",
  "RESTORE_INTENT",
  "RESTORED",
  "PROOF_COMPLETED",
  "CLEANUP_INTENT",
]);

function retryAfterMs(error: ApiRequestError): number {
  const value = error.headers.get("Retry-After")?.trim();
  if (!value) return READY_POLL_RATE_LIMIT_FALLBACK_MS;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(READY_POLL_INTERVAL_MS, seconds * 1_000);
  }
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(READY_POLL_INTERVAL_MS, date - Date.now())
    : READY_POLL_RATE_LIMIT_FALLBACK_MS;
}

const REQUIRED_ACL_PREVIEW_CONTINUITY_FIELDS = [
  "rootFolderId",
  "sharedDriveId",
  "rootRevision",
  "complete",
  "nodeCount",
  "inventoryHash",
  "manifestHash",
  "reconciliationHash",
  "freezeAuthorizationId",
  "directGrantCount",
  "topologyHash",
  "aclHash",
] as const satisfies readonly Exclude<
  keyof DriveAclBaselinePreview,
  "previewToken"
>[];

function isPresentPreviewValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "boolean";
}

export function hasExactAclPreviewContinuity(
  previous: DriveAclBaselinePreview | null,
  current: DriveAclBaselinePreview | null,
): boolean {
  if (!previous || !current) return false;
  if (
    !previous.previewToken.trim() ||
    !current.previewToken.trim() ||
    previous.previewToken === current.previewToken
  ) {
    return false;
  }

  const previousFields = Object.keys(previous).filter(
    (field) => field !== "previewToken",
  );
  const currentFields = Object.keys(current).filter(
    (field) => field !== "previewToken",
  );
  const exposedFields = new Set([...previousFields, ...currentFields]);

  if (
    REQUIRED_ACL_PREVIEW_CONTINUITY_FIELDS.some(
      (field) =>
        !Object.prototype.hasOwnProperty.call(previous, field) ||
        !Object.prototype.hasOwnProperty.call(current, field),
    ) ||
    previousFields.length !== currentFields.length ||
    exposedFields.size !== previousFields.length
  ) {
    return false;
  }

  return [...exposedFields].every((field) => {
    const previousValue = previous[field as keyof DriveAclBaselinePreview];
    const currentValue = current[field as keyof DriveAclBaselinePreview];
    return (
      isPresentPreviewValue(previousValue) &&
      isPresentPreviewValue(currentValue) &&
      Object.is(previousValue, currentValue)
    );
  });
}

const OPERATION_TIMEOUT_MS: Record<Operation, number> = {
  preflight: REQUEST_TIMEOUT_MS,
  register: REQUEST_TIMEOUT_MS,
  plan: REQUEST_TIMEOUT_MS,
  provision: REQUEST_TIMEOUT_MS,
  "acl-preview": ACL_REQUEST_TIMEOUT_MS,
  "acl-capture": ACL_REQUEST_TIMEOUT_MS,
  transition: REQUEST_TIMEOUT_MS,
  "projection-retry": REQUEST_TIMEOUT_MS,
  "readiness-manifest": ACL_REQUEST_TIMEOUT_MS,
  "readiness-review": REQUEST_TIMEOUT_MS,
  "readiness-export": ACL_REQUEST_TIMEOUT_MS,
  "authorization-issue": REQUEST_TIMEOUT_MS,
  "authorization-revoke": REQUEST_TIMEOUT_MS,
  "reparent-plan": ACL_REQUEST_TIMEOUT_MS,
  "reparent-authorize": REQUEST_TIMEOUT_MS,
  "reparent-run": ACL_REQUEST_TIMEOUT_MS,
  "reparent-recover": ACL_REQUEST_TIMEOUT_MS,
  "ready-status": REQUEST_TIMEOUT_MS,
  "ready-bundle": ACL_REQUEST_TIMEOUT_MS,
};

type ReadResource = "root" | "nodes" | "health";
type ReadStatus = "idle" | "loading" | "success" | "error";

const READ_ERROR_MESSAGE: Record<ReadResource, string> = {
  root: "No se pudo cargar el estado de la jerarquía. No se modificaron datos.",
  nodes:
    "No se pudieron cargar los nodos de la jerarquía. No se modificaron datos.",
  health:
    "No se pudo cargar la salud de las proyecciones de pago. No se modificaron datos.",
};

function isTransientReadError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "TimeoutError")
    return true;
  if (error instanceof ApiRequestError) {
    return [502, 503, 504].includes(error.status);
  }
  return error instanceof TypeError;
}

async function readAttempt<T>(
  request: (signal: AbortSignal) => Promise<T>,
  operationSignal: AbortSignal,
): Promise<T> {
  if (operationSignal.aborted) {
    throw new DOMException("Lectura cancelada", "AbortError");
  }

  const controller = new AbortController();
  const abortAttempt = () => controller.abort();
  operationSignal.addEventListener("abort", abortAttempt, { once: true });
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new DOMException("Tiempo de espera agotado", "TimeoutError"));
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([request(controller.signal), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    operationSignal.removeEventListener("abort", abortAttempt);
  }
}

async function readWithRetry<T>(
  request: (signal: AbortSignal) => Promise<T>,
  operationSignal: AbortSignal,
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await readAttempt(request, operationSignal);
    } catch (error) {
      if (operationSignal.aborted) {
        throw new DOMException("Lectura cancelada", "AbortError");
      }
      if (attempt === 0 && isTransientReadError(error)) continue;
      throw error;
    }
  }
  throw new Error("Unreachable read retry state");
}

const ISSUE_MESSAGE: Record<string, string> = {
  ACL_BASELINE_MISSING:
    "El baseline ACL todavía no fue capturado. Esto no impide PREPARING ni el canary; será obligatorio antes de READY.",
  BLOCKED_ROOT_MISMATCH:
    "La identidad configurada de la carpeta SIG no coincide con la esperada.",
  ROOT_NAME_MISMATCH: "La carpeta raíz configurada no se llama SIG.",
  ROOT_DRIVE_ID_MISMATCH:
    "La carpeta SIG no pertenece al Shared Drive configurado.",
  ROOT_PARENT_MISMATCH:
    "La carpeta SIG no está directamente dentro del Shared Drive configurado.",
  SHARED_DRIVE_ROOT_MISMATCH:
    "No se pudo verificar la raíz del Shared Drive configurado.",
  CANNOT_ADD_CHILDREN: "La cuenta no puede crear carpetas dentro de SIG.",
  CANNOT_LIST_CHILDREN: "La cuenta no puede listar el contenido de SIG.",
};

function issueMessage(issue: string): string {
  const code = issue.split(":", 1)[0];
  return (
    ISSUE_MESSAGE[code] ?? "La verificación encontró una condición pendiente."
  );
}

function operationErrorMessage(error: unknown): string {
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return "La operación tardó demasiado y fue cancelada. No se aplicaron cambios en la base de datos; puedes intentarlo nuevamente.";
  }
  if (error instanceof ApiRequestError) {
    const reason = Array.isArray(error.body.message)
      ? error.body.message.join(". ")
      : error.body.message;
    const guidance = error.body.retryable
      ? " Conserva la razón ingresada y vuelve a intentarlo cuando se corrija la condición."
      : " Revisa la condición indicada antes de volver a intentarlo.";
    const technicalCode = error.body.code
      ? ` Código técnico: ${error.body.code}.`
      : "";
    return `${reason}${guidance}${technicalCode}`;
  }
  return "No se pudo completar la operación y no se aplicaron cambios en la base de datos. Conserva la razón ingresada y vuelve a intentarlo; si persiste, contacta al administrador.";
}

function localDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleString("es-PE")
    : "Fecha no válida";
}

export function DriveHierarchyManagement() {
  const role = useAuthStore((state) => state.user?.role?.code);
  const canManage = hasRoleCapability(role, ROLE_CAPABILITY.DRIVE_HIERARCHY_ADMIN);
  const canViewHierarchy = hasRoleCapability(role, ROLE_CAPABILITY.DRIVE_HIERARCHY);
  const canIssueReadiness =
    role === ROLE_CODE.AUDITOR_DIRECCION || role === ROLE_CODE.ADMIN_SISTEMA;
  const canRenewRuntime = role === ROLE_CODE.GIOF_MANAGER;
  const [rootStatus, setRootStatus] = useState<DriveHierarchyRootStatus | null>(
    null,
  );
  const [nodes, setNodes] = useState<DriveHierarchyNode[]>([]);
  const [projectionHealth, setProjectionHealth] =
    useState<DrivePaymentProjectionHealth | null>(null);
  const [readStatus, setReadStatus] = useState<
    Record<ReadResource, ReadStatus>
  >({
    root: "idle",
    nodes: "idle",
    health: "idle",
  });
  const [preflight, setPreflight] = useState<DriveHierarchyPreflight | null>(
    null,
  );
  const [plan, setPlan] = useState<DriveProvisionPlan | null>(null);
  const [aclPreview, setAclPreview] = useState<DriveAclBaselinePreview | null>(
    null,
  );
  const [previousAclPreview, setPreviousAclPreview] =
    useState<DriveAclBaselinePreview | null>(null);
  const [readinessManifest, setReadinessManifest] =
    useState<DriveReadinessManifestPage | null>(null);
  const [readinessPages, setReadinessPages] = useState<
    Record<number, DriveReadinessManifestPage>
  >({});
  const [readinessCursor, setReadinessCursor] = useState(0);
  const [readinessRows, setReadinessRows] = useState<
    Record<string, DriveReadinessManifestRow>
  >({});
  const [readinessServerRows, setReadinessServerRows] = useState<
    Record<string, DriveReadinessManifestRow>
  >({});
  const [reviewedReadinessPages, setReviewedReadinessPages] = useState<
    number[]
  >([]);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewedHash, setReviewedHash] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | null>(null);
  const [canary, setCanary] = useState(true);
  const [reason, setReason] = useState("");
  const [captureAuthorizationId, setCaptureAuthorizationId] = useState("");
  const [reconciliation, setReconciliation] =
    useState<DriveReadinessReconciliation | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [freezeAuthorizationId, setFreezeAuthorizationId] = useState("");
  const [freezeReason, setFreezeReason] = useState("");
  const [readyAuthorizationId, setReadyAuthorizationId] = useState("");
  const [readyEvidenceIds, setReadyEvidenceIds] = useState("");
  const [readyReason, setReadyReason] = useState("");
  const [authorizationTargets, setAuthorizationTargets] = useState<
    DriveReadinessAuthorizationTarget[]
  >([]);
  const [authorizationPurpose, setAuthorizationPurpose] =
    useState<DriveReadinessAuthorizationPurpose>(
      role === ROLE_CODE.ADMIN_SISTEMA ? "READY" : "FREEZE",
    );
  const [authorizationTargetId, setAuthorizationTargetId] = useState("");
  const [authorizationReason, setAuthorizationReason] = useState("");
  const [authorizationManifestHash, setAuthorizationManifestHash] =
    useState("");
  const [authorizationInventoryHash, setAuthorizationInventoryHash] =
    useState("");
  const [authorizationPreviewTokens, setAuthorizationPreviewTokens] =
    useState("");
  const [authorizationEvidenceIds, setAuthorizationEvidenceIds] = useState("");
  const [issuedAuthorization, setIssuedAuthorization] =
    useState<DriveReadinessAuthorization | null>(null);
  const [reparentPlan, setReparentPlan] =
    useState<DriveReparentProofPlan | null>(null);
  const [reparentRun, setReparentRun] = useState<DriveReparentProofRun | null>(
    null,
  );
  const [readyStatus, setReadyStatus] =
    useState<DriveReadyEvidenceStatus | null>(null);
  const [reparentAuthorizationId, setReparentAuthorizationId] = useState("");
  const [reparentConfirmed, setReparentConfirmed] = useState(false);
  const [reparentRunReason, setReparentRunReason] = useState("");
  const [reparentRecoveryReason, setReparentRecoveryReason] = useState("");
  const [bundleReason, setBundleReason] = useState("");
  const [reparentIssuerPlanHash, setReparentIssuerPlanHash] = useState("");
  const [issuedReparentAuthorization, setIssuedReparentAuthorization] =
    useState<DriveReparentProofAuthorization | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [targetStatus, setTargetStatus] = useState<DriveHierarchyLifecycle>(
    DRIVE_HIERARCHY_LIFECYCLE.PAUSED,
  );
  const [confirmation, setConfirmation] = useState<
    | "register"
    | "acl-baseline"
    | "provision"
    | "transition"
    | "projection-retry"
    | null
  >(null);
  const [readinessConfirmation, setReadinessConfirmation] = useState<
    "bulk-delete" | "reset" | null
  >(null);
  const [retryPaymentId, setRetryPaymentId] = useState<string | null>(null);
  const [activeOperation, setActiveOperation] = useState<Operation | null>(
    null,
  );
  const operationRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const operationIdRef = useRef(0);
  const proofAttemptRef = useRef<{
    authorizationId: string;
    planHash: string;
    idempotencyKey: string;
  } | null>(null);
  const readyInitialReadStartedRef = useRef(false);
  const [readyPollSequence, setReadyPollSequence] = useState(0);
  const [readyPollDelayMs, setReadyPollDelayMs] = useState(
    READY_POLL_INTERVAL_MS,
  );
  const readinessReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const readOperationRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const readOperationIdRef = useRef(0);

  const isReadBusy = Object.values(readStatus).some(
    (status) => status === "loading",
  );
  const isBusy = activeOperation !== null || isReadBusy;
  const isAclInventoryBusy =
    activeOperation === OPERATION.ACL_PREVIEW ||
    activeOperation === OPERATION.ACL_CAPTURE;
  const orderedReadinessRows = Object.values(readinessRows).sort(
    (left, right) => left.sequence - right.sequence,
  );
  const localReadinessKeepCount = orderedReadinessRows.filter(
    (row) => row.disposition === "KEEP",
  ).length;
  const localReadinessDeleteCount = orderedReadinessRows.filter(
    (row) => row.disposition === "DELETE",
  ).length;
  const blockedReadinessDeleteCount = orderedReadinessRows.filter(
    (row) => row.disposition === "DELETE" && row.referenceStatus !== "CLEAR",
  ).length;
  const editableReadinessCount = orderedReadinessRows.filter(
    (row) => row.reasonCode !== "CANONICAL_REQUIRED",
  ).length;
  const readinessPageCount = readinessManifest
    ? Object.keys(readinessPages).length
    : 0;
  const isLocalReadinessReviewComplete =
    readinessManifest !== null &&
    orderedReadinessRows.length === readinessManifest.totalCount &&
    blockedReadinessDeleteCount === 0 &&
    orderedReadinessRows.every((row) => row.reasonCode !== "REVIEW_REQUIRED");
  const isReadinessDirty =
    reviewReason.length > 0 ||
    reviewedReadinessPages.length > 0 ||
    reviewedHash !== null ||
    orderedReadinessRows.some((row) => {
      const serverRow = readinessServerRows[row.stableId];
      return (
        !serverRow ||
        row.disposition !== serverRow.disposition ||
        row.reasonCode !== serverRow.reasonCode
      );
    });
  const nodesKnown = readStatus.nodes === "success";
  const canaryComplete =
    nodesKnown &&
    nodes.some(
      (node) => node.logical_key === `U:${year}:01` && !node.last_error_at,
    );
  const effectiveCanary = !canaryComplete || canary;
  const parsedReadyEvidenceIds = readyEvidenceIds
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const hasSevenValidReadyEvidenceIds =
    parsedReadyEvidenceIds.length === 7 &&
    new Set(parsedReadyEvidenceIds).size === 7 &&
    parsedReadyEvidenceIds.every((value) => UUID_PATTERN.test(value));
  const authorizationPreviewTokenList = authorizationPreviewTokens
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const authorizationEvidenceIdList = authorizationEvidenceIds
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const hasExactAclPreviewPair = hasExactAclPreviewContinuity(
    previousAclPreview,
    aclPreview,
  );
  const isAuthorizationBindingValid =
    authorizationPurpose === "FREEZE"
      ? SHA256_PATTERN.test(authorizationManifestHash.trim())
      : authorizationPurpose === "CAPTURE"
        ? SHA256_PATTERN.test(authorizationManifestHash.trim()) &&
          SHA256_PATTERN.test(authorizationInventoryHash.trim()) &&
          authorizationPreviewTokenList.length === 2 &&
          new Set(authorizationPreviewTokenList).size === 2
        : authorizationEvidenceIdList.length === 7 &&
          new Set(authorizationEvidenceIdList).size === 7 &&
          authorizationEvidenceIdList.every((value) =>
            UUID_PATTERN.test(value),
           );

  async function runOperation<T>(
    operation: Operation,
    request: (signal: AbortSignal) => Promise<T>,
    onSuccess: (result: T, signal: AbortSignal) => void | Promise<void>,
    onError?: (error: unknown) => boolean,
  ): Promise<boolean> {
    if (operationRef.current || readOperationRef.current) return false;
    const id = ++operationIdRef.current;
    const controller = new AbortController();
    operationRef.current = { id, controller };
    setActiveOperation(operation);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new DOMException("Tiempo de espera agotado", "TimeoutError"));
      }, OPERATION_TIMEOUT_MS[operation]);
    });

    let succeeded = false;
    try {
      const result = await Promise.race([request(controller.signal), timeout]);
      if (operationRef.current?.id !== id) return false;
      await onSuccess(result, controller.signal);
      succeeded = true;
    } catch (error) {
      if (operationRef.current?.id !== id) return false;
      if (!onError?.(error)) toast.error(operationErrorMessage(error));
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (operationRef.current?.id === id) {
        operationRef.current = null;
        setActiveOperation(null);
      }
    }
    return succeeded;
  }

  function load(): number | null {
    if (operationRef.current || readOperationRef.current) return null;

    const id = ++readOperationIdRef.current;
    const controller = new AbortController();
    readOperationRef.current = { id, controller };
    setReadStatus({
      root: "loading",
      nodes: "loading",
      health: canManage ? "loading" : "idle",
    });

    const runResource = async <T,>(
      resource: ReadResource,
      request: (signal: AbortSignal) => Promise<T>,
      commit: (result: T) => void,
    ) => {
      try {
        const result = await readWithRetry(request, controller.signal);
        if (readOperationRef.current?.id !== id) return;
        commit(result);
        setReadStatus((current) => ({ ...current, [resource]: "success" }));
      } catch {
        if (readOperationRef.current?.id !== id || controller.signal.aborted) {
          return;
        }
        setReadStatus((current) => ({ ...current, [resource]: "error" }));
        toast.error(READ_ERROR_MESSAGE[resource]);
      }
    };

    const reads = [
      runResource("root", driveHierarchyApi.getRoot, setRootStatus),
      runResource("nodes", driveHierarchyApi.getNodes, setNodes),
    ];
    if (canManage) {
      reads.push(
        runResource(
          "health",
          driveHierarchyApi.getPaymentProjectionHealth,
          setProjectionHealth,
        ),
      );
    }

    void Promise.allSettled(reads).then(() => {
      if (readOperationRef.current?.id === id) {
        readOperationRef.current = null;
      }
    });
    return id;
  }

  function cancelRead(id: number | null) {
    if (id === null || readOperationRef.current?.id !== id) return;
    const operation = readOperationRef.current;
    readOperationRef.current = null;
    operation.controller.abort();
  }

  useEffect(() => {
    if (!canViewHierarchy) return;
    const readId = load();
    return () => cancelRead(readId);
  }, [canManage, canViewHierarchy]);

  useEffect(() => {
    if (!canManage) {
      setReconciliation(null);
      setReconciliationLoading(false);
      return;
    }
    const controller = new AbortController();
    setReconciliation(null);
    setReconciliationLoading(true);
    void driveHierarchyApi
      .getReadinessReconciliation(controller.signal)
      .then(setReconciliation)
      .catch((error) => {
        if (!controller.signal.aborted)
          toast.error(operationErrorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setReconciliationLoading(false);
      });
    return () => controller.abort();
  }, [canManage]);

  useEffect(() => {
    if (!canManage) return;
    if (activeOperation !== null) return;
    const proofStage = readyStatus?.proof?.stage;
    const isInitialRead =
      readyStatus === null && !readyInitialReadStartedRef.current;
    const shouldPoll =
      isInitialRead ||
      (readyStatus?.complete === false &&
        proofStage !== undefined &&
        ACTIVE_PROOF_STAGES.has(proofStage));
    if (!shouldPoll) return;
    if (isInitialRead) readyInitialReadStartedRef.current = true;

    const controller = new AbortController();
    const poll = async () => {
      try {
        const status = await driveHierarchyApi.getReadyEvidenceStatus(
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setReadyPollDelayMs(READY_POLL_INTERVAL_MS);
        await applyReadyStatus(status, controller.signal);
        if (controller.signal.aborted) return;
        setReadyPollSequence((value) => value + 1);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiRequestError && error.status === 429) {
          if (readyStatus === null) readyInitialReadStartedRef.current = false;
          setReadyPollDelayMs(retryAfterMs(error));
          setReadyPollSequence((value) => value + 1);
          return;
        }
        if (readyStatus?.proof && ACTIVE_PROOF_STAGES.has(readyStatus.proof.stage)) {
          setReadyPollDelayMs(READY_POLL_INTERVAL_MS);
          setReadyPollSequence((value) => value + 1);
        }
      }
    };
    if (isInitialRead) {
      void poll();
    }
    const timer = isInitialRead ? null : setTimeout(poll, readyPollDelayMs);
    return () => {
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, [
    activeOperation,
    canManage,
    readyPollDelayMs,
    readyPollSequence,
    readyStatus,
  ]);

  useEffect(() => {
    if (!canManage && !canIssueReadiness) return;
    const timer = setInterval(() => setClockMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [canManage, canIssueReadiness]);

  useEffect(() => {
    if (!canIssueReadiness) return;
    const controller = new AbortController();
    void driveHierarchyApi
      .getReadinessAuthorizationTargets(controller.signal)
      .then((targets) => {
        setAuthorizationTargets(targets);
        setAuthorizationTargetId((current) => current || targets[0]?.id || "");
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          toast.error(operationErrorMessage(error));
      });
    return () => controller.abort();
  }, [canIssueReadiness]);

  async function issueReadinessAuthorization() {
    if (
      !authorizationTargetId ||
      !authorizationReason.trim() ||
      !isAuthorizationBindingValid
    )
      return;
    await runOperation(
      OPERATION.AUTHORIZATION_ISSUE,
      (signal) =>
        driveHierarchyApi.issueReadinessAuthorization(
          {
            purpose: authorizationPurpose,
            targetActorId: authorizationTargetId,
            reason: authorizationReason.trim(),
            ...(authorizationPurpose !== "READY"
              ? { manifestHash: authorizationManifestHash.trim() }
              : {}),
            ...(authorizationPurpose === "CAPTURE"
              ? {
                  inventoryHash: authorizationInventoryHash.trim(),
                  previewTokens: authorizationPreviewTokenList,
                }
              : {}),
            ...(authorizationPurpose === "READY"
              ? { evidenceRunIds: authorizationEvidenceIdList }
              : {}),
          },
          signal,
        ),
      (issued) => {
        setIssuedAuthorization(issued);
        toast.success("Autorización emitida por cinco minutos.");
      },
    );
  }

  async function executeFreeze() {
    const expectedHash = reconciliation?.manifest_hash ?? "";
    if (
      reconciliation?.reconciled !== true ||
      reconciliation.frozen ||
      !SHA256_PATTERN.test(expectedHash) ||
      !freezeAuthorizationId.trim() ||
      !freezeReason.trim()
    )
      return;
    await runOperation(
      OPERATION.TRANSITION,
      (signal) =>
        driveHierarchyApi.freezeReadiness(
          {
            expectedHash,
            authorizationId: freezeAuthorizationId.trim(),
            reason: freezeReason.trim(),
          },
          signal,
        ),
      (result) => {
        setReconciliation((current) => ({ ...current, ...result }));
        setFreezeAuthorizationId("");
        setFreezeReason("");
        toast.success("FREEZE ejecutado por el gestor objetivo.");
      },
    );
  }

  async function executeReady() {
    if (
      !hasSevenValidReadyEvidenceIds ||
      !UUID_PATTERN.test(readyAuthorizationId.trim()) ||
      !readyReason.trim()
    )
      return;
    await runOperation(
      OPERATION.TRANSITION,
      (signal) =>
        driveHierarchyApi.transition(
          {
            status: DRIVE_HIERARCHY_LIFECYCLE.READY,
            reason: readyReason.trim(),
            evidenceRunIds: parsedReadyEvidenceIds,
            authorizationId: readyAuthorizationId.trim(),
          },
          signal,
        ),
      () => {
        setReadyAuthorizationId("");
        setReadyEvidenceIds("");
        setReadyReason("");
        toast.success(
          "Transición READY registrada con autorización consumida.",
        );
      },
    );
  }

  async function revokeReadinessAuthorization() {
    if (!issuedAuthorization || !authorizationReason.trim()) return;
    await runOperation(
      OPERATION.AUTHORIZATION_REVOKE,
      (signal) =>
        driveHierarchyApi.revokeReadinessAuthorization(
          issuedAuthorization.authorizationId,
          authorizationReason.trim(),
          signal,
        ),
      () => {
        setIssuedAuthorization(null);
        toast.success("Autorización revocada.");
      },
    );
  }

  async function loadReparentPlan() {
    await runOperation(
      OPERATION.REPARENT_PLAN,
      driveHierarchyApi.getReparentProofPlan,
      setReparentPlan,
    );
  }

  async function applyReadyStatus(
    status: DriveReadyEvidenceStatus,
    signal: AbortSignal,
  ) {
    let proof = status.proof;
    if (
      proof?.stage !== "CLEANED" &&
      status.latestCleanedProofRunId !== null
    ) {
      proof = null;
      const proofRunId = status.latestCleanedProofRunId;
      if (UUID_PATTERN.test(proofRunId)) {
        try {
          const candidate = await driveHierarchyApi.getReparentProofRun(
            proofRunId,
            signal,
          );
          if (
            !signal.aborted &&
            candidate.proofRunId === proofRunId &&
            candidate.stage === "CLEANED"
          ) {
            proof = candidate;
          }
        } catch {
          // Fail closed: status hydration must never infer a proof from gate IDs.
        }
      }
    }
    if (signal.aborted) return;
    setReadyStatus(status);
    setReparentRun(proof);
    if (status.complete && status.orderedEvidenceRunIds.length === 7) {
      setReadyEvidenceIds(status.orderedEvidenceRunIds.join(","));
    } else {
      setReadyEvidenceIds("");
    }
    if (proof?.stage === "CLEANED") {
      proofAttemptRef.current = null;
    }
  }

  async function refreshReadyStatus() {
    await runOperation(
      OPERATION.READY_STATUS,
      driveHierarchyApi.getReadyEvidenceStatus,
      applyReadyStatus,
    );
  }

  async function issueReparentAuthorization() {
    if (
      role !== ROLE_CODE.AUDITOR_DIRECCION ||
      !authorizationTargetId ||
      !SHA256_PATTERN.test(reparentIssuerPlanHash) ||
      !authorizationReason.trim()
    )
      return;
    await runOperation(
      OPERATION.REPARENT_AUTHORIZE,
      (signal) =>
        driveHierarchyApi.issueReparentProofAuthorization(
          {
            targetActorId: authorizationTargetId,
            proofPlanHash: reparentIssuerPlanHash,
            reason: authorizationReason.trim(),
          },
          signal,
        ),
      setIssuedReparentAuthorization,
    );
  }

  async function executeReparentProof() {
    if (
      !reparentPlan ||
      !UUID_PATTERN.test(reparentAuthorizationId) ||
      !reparentRunReason.trim() ||
      !reparentConfirmed
    )
      return;
    const authorizationId = reparentAuthorizationId.trim();
    const planHash = reparentPlan.planHash;
    const currentAttempt = proofAttemptRef.current;
    const attempt =
      currentAttempt?.authorizationId === authorizationId &&
      currentAttempt.planHash === planHash
        ? currentAttempt
        : {
            authorizationId,
            planHash,
            idempotencyKey: crypto.randomUUID(),
          };
    proofAttemptRef.current = attempt;
    if (reparentRun?.proofRunId === attempt.idempotencyKey) return;
    await runOperation(
      OPERATION.REPARENT_RUN,
      (signal) =>
        driveHierarchyApi.runReparentProof(
          {
            authorizationId: attempt.authorizationId,
            idempotencyKey: attempt.idempotencyKey,
            proofPlanHash: attempt.planHash,
            reason: reparentRunReason.trim(),
            confirmRealDriveMutation: true,
          },
          signal,
        ),
      async (run, signal) => {
        setReparentRun(run);
        if (run.stage === "CLEANED") {
          proofAttemptRef.current = null;
          setReparentAuthorizationId("");
          setReparentConfirmed(false);
          setReparentRunReason("");
        }
        const status = await driveHierarchyApi.getReadyEvidenceStatus(
          signal,
        );
        await applyReadyStatus(status, signal);
      },
    );
  }

  async function recoverReparentProof() {
    if (!reparentRun || !reparentRecoveryReason.trim()) return;
    await runOperation(
      OPERATION.REPARENT_RECOVER,
      (signal) =>
        driveHierarchyApi.recoverReparentProof(
          reparentRun.proofRunId,
          {
            reason: reparentRecoveryReason.trim(),
            confirmCompensation: true,
          },
          signal,
        ),
      async (_result, signal) => {
        setReparentRecoveryReason("");
        const status = await driveHierarchyApi.getReadyEvidenceStatus(
          signal,
        );
        await applyReadyStatus(status, signal);
      },
    );
  }

  async function produceReadyBundle() {
    if (reparentRun?.stage !== "CLEANED" || !bundleReason.trim()) return;
    await runOperation(
      OPERATION.READY_BUNDLE,
      (signal) =>
        driveHierarchyApi.produceReadyBundle(
          {
            operationId: crypto.randomUUID(),
            reason: bundleReason.trim(),
            proofRunId: reparentRun.proofRunId,
          },
          signal,
        ),
      async (bundle, signal) => {
        const status = await driveHierarchyApi.getReadyEvidenceStatus(
          signal,
        );
        await applyReadyStatus(status, signal);
        if (
          bundle.complete &&
          status.complete &&
          status.orderedEvidenceRunIds.length === 7
        ) {
          toast.success("Bundle READY completo: siete IDs autocompletados.");
        } else {
          toast.error(
            `Bundle parcial o pendiente de validación: ${status.completeCount}/7.`,
          );
        }
      },
    );
  }

  async function copyTransientValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado. No se guardó en la aplicación.`);
    } catch {
      toast.error(
        "No se pudo copiar. Selecciona el valor y cópialo manualmente.",
      );
    }
  }

  async function runPreflight() {
    await runOperation(
      OPERATION.PREFLIGHT,
      (signal) => driveHierarchyApi.preflight(signal),
      setPreflight,
    );
  }

  async function previewPlan() {
    await runOperation(
      OPERATION.PLAN,
      (signal) => driveHierarchyApi.plan(year, month, effectiveCanary, signal),
      setPlan,
    );
  }

  async function previewAclBaseline() {
    await runOperation(
      OPERATION.ACL_PREVIEW,
      (signal) => driveHierarchyApi.previewAclBaseline(signal),
      (result) => {
        setPreviousAclPreview(aclPreview);
        setAclPreview(result);
      },
    );
  }

  async function fetchCompleteReadinessManifest(signal: AbortSignal) {
    const pages: Record<number, DriveReadinessManifestPage> = {};
    const rows: DriveReadinessManifestRow[] = [];
    const stableIds = new Set<string>();
    const sequences = new Set<number>();
    const visitedCursors = new Set<number>();
    let cursor = 0;
    let first: DriveReadinessManifestPage | null = null;

    while (true) {
      if (visitedCursors.has(cursor)) {
        throw new Error("READINESS_CURSOR_DID_NOT_ADVANCE");
      }
      visitedCursors.add(cursor);
      const page = await driveHierarchyApi.getReadinessManifest(
        cursor,
        READINESS_PAGE_LIMIT,
        signal,
      );
      first ??= page;
      if (
        page.totalCount < 4 ||
        page.totalCount > 1000 ||
        page.hash !== first.hash ||
        page.totalCount !== first.totalCount ||
        page.keepCount !== first.keepCount ||
        page.deleteCount !== first.deleteCount
      ) {
        throw new Error("READINESS_SNAPSHOT_INCONSISTENT");
      }
      const normalizedRows = page.rows.map((row) => ({
        ...row,
        referenceDetails: page.referenceDetailsByStableId?.[row.stableId] ?? [],
      }));
      for (const row of normalizedRows) {
        const expectedSequence = rows.length + 1;
        if (
          !row.stableId.trim() ||
          row.sequence !== expectedSequence ||
          stableIds.has(row.stableId) ||
          sequences.has(row.sequence)
        ) {
          throw new Error("READINESS_SEQUENCE_INCONSISTENT");
        }
        stableIds.add(row.stableId);
        sequences.add(row.sequence);
        rows.push(row);
      }
      pages[cursor] = { ...page, rows: normalizedRows };

      if (page.nextCursor === null) break;
      if (
        normalizedRows.length === 0 ||
        page.nextCursor !== cursor + normalizedRows.length ||
        page.nextCursor <= cursor ||
        page.nextCursor > page.totalCount
      ) {
        throw new Error("READINESS_CURSOR_DID_NOT_ADVANCE");
      }
      cursor = page.nextCursor;
    }

    if (
      !first ||
      rows.length !== first.totalCount ||
      rows.filter((row) => row.disposition === "KEEP").length !==
        first.keepCount ||
      rows.filter((row) => row.disposition === "DELETE").length !==
        first.deleteCount
    ) {
      throw new Error("READINESS_TOTAL_INCONSISTENT");
    }
    return { first: pages[0], pages, rows };
  }

  async function loadReadinessManifest() {
    await runOperation(
      OPERATION.READINESS_MANIFEST,
      fetchCompleteReadinessManifest,
      ({ first, pages, rows }) => {
        const freshRows = Object.fromEntries(
          rows.map((row) => [row.stableId, row]),
        );
        setReadinessServerRows(freshRows);
        setReadinessRows(freshRows);
        setReadinessPages(pages);
        setReadinessCursor(0);
        setReadinessManifest(first);
        setReviewedReadinessPages([]);
        setReviewedHash(null);
      },
    );
  }

  function showReadinessPage(cursor: number) {
    const page = readinessPages[cursor];
    if (!page) return;
    setReadinessCursor(cursor);
    setReadinessManifest(page);
  }

  function updateReadinessRow(
    stableId: string,
    patch: Partial<DriveReadinessManifestRow>,
  ) {
    setReadinessRows((current) => ({
      ...current,
      [stableId]: { ...current[stableId], ...patch },
    }));
    setReviewedReadinessPages((current) =>
      current.filter((cursor) => cursor !== readinessCursor),
    );
    setReviewedHash(null);
  }

  async function submitReadinessReview() {
    const rows = orderedReadinessRows;
    if (
      !readinessManifest ||
      rows.length !== readinessManifest.totalCount ||
      !reviewReason.trim() ||
      blockedReadinessDeleteCount > 0 ||
      rows.some((row) => row.reasonCode === "REVIEW_REQUIRED")
    )
      return;
    await runOperation(
      OPERATION.READINESS_REVIEW,
      (signal) =>
        driveHierarchyApi.reviewReadinessManifest(
          {
            expectedHash: readinessManifest?.hash ?? "",
            decisions: rows.map((row) => ({
              stableId: row.stableId,
              disposition: row.disposition,
              reasonCode: row.reasonCode,
            })),
            reason: reviewReason.trim(),
          },
          signal,
        ),
      async (result) => {
        setReviewedHash(result.hash);
        setReviewReason("");
        toast.success(
          "Revisión del manifiesto registrada sin ejecutar limpieza.",
        );
        setReconciliation(null);
        setReconciliationLoading(true);
        try {
          const gate = await driveHierarchyApi.getReadinessReconciliation(
            operationRef.current?.controller.signal,
          );
          setReconciliation(gate);
        } catch {
          if (!operationRef.current?.controller.signal.aborted) {
            toast.error(
              "La revisión se registró correctamente, pero falló la actualización del estado persistido. Vuelve a consultar el estado antes de ejecutar FREEZE.",
            );
          }
        } finally {
          if (!operationRef.current?.controller.signal.aborted) {
            setReconciliationLoading(false);
          }
        }
      },
      (error) => {
        if (error instanceof ApiRequestError && error.status === 409) {
          toast.error(
            "El manifiesto cambió o su hash quedó obsoleto. Se conservaron tus decisiones; recarga y revisa antes de reenviar.",
          );
          return true;
        }
        if (error instanceof ApiRequestError) {
          toast.error(operationErrorMessage(error));
          return true;
        }
        toast.error(
          "No se registró ninguna revisión. Se conservaron todas las decisiones y la razón para reintentar.",
        );
        return true;
      },
    );
  }

  async function exportReadinessManifest() {
    if (!readinessManifest || !isLocalReadinessReviewComplete) return;
    await runOperation(
      OPERATION.READINESS_EXPORT,
      (signal) =>
        driveHierarchyApi.downloadReadinessManifest(
          {
            expectedHash: readinessManifest.hash,
            decisions: orderedReadinessRows.map((row) => ({
              stableId: row.stableId,
              disposition: row.disposition,
              reasonCode: row.reasonCode,
            })),
          },
          signal,
        ),
      (download) => {
        const href = URL.createObjectURL(download.blob);
        const anchor = document.createElement("a");
        anchor.href = href;
        anchor.download = download.filename ?? "drive-b1-readiness.csv";
        anchor.click();
        URL.revokeObjectURL(href);
      },
      (error) => {
        if (error instanceof ApiRequestError && error.status === 409) {
          toast.error(
            "No se exportó el CSV: el manifiesto cambió o su hash quedó obsoleto. Se conservaron tus decisiones.",
          );
          return true;
        }
        if (error instanceof ApiRequestError) {
          toast.error(operationErrorMessage(error));
          return true;
        }
        toast.error(
          "No se exportó ningún archivo. Se conservaron tus decisiones locales.",
        );
        return true;
      },
    );
  }

  function markCurrentReadinessPageReviewed() {
    if (!readinessManifest) return;
    setReadinessRows((current) => {
      const next = { ...current };
      for (const serverRow of readinessManifest.rows) {
        const row = next[serverRow.stableId] ?? serverRow;
        if (row.reasonCode === "CANONICAL_REQUIRED") continue;
        next[row.stableId] = {
          ...row,
          reasonCode:
            row.reasonCode === "REVIEW_REQUIRED"
              ? "CLIENT_REVIEWED"
              : row.reasonCode,
        };
      }
      return next;
    });
    setReviewedReadinessPages((current) =>
      current.includes(readinessCursor)
        ? current
        : [...current, readinessCursor].sort((left, right) => left - right),
    );
    setReviewedHash(null);
  }

  function markAllNonCanonicalDelete() {
    if (
      !readinessManifest ||
      orderedReadinessRows.length !== readinessManifest.totalCount ||
      editableReadinessCount === 0
    )
      return;
    readinessReturnFocusRef.current =
      document.activeElement as HTMLButtonElement;
    setReadinessConfirmation("bulk-delete");
  }

  function closeReadinessConfirmation() {
    setReadinessConfirmation(null);
    setTimeout(() => readinessReturnFocusRef.current?.focus(), 0);
  }

  function confirmAllNonCanonicalDelete() {
    setReadinessRows((current) =>
      Object.fromEntries(
        Object.entries(current).map(([stableId, row]) => [
          stableId,
          row.reasonCode === "CANONICAL_REQUIRED"
            ? row
            : {
                ...row,
                disposition: "DELETE" as const,
                reasonCode: "CLIENT_REVIEWED",
              },
        ]),
      ),
    );
    setReviewedReadinessPages(
      Object.keys(readinessPages)
        .map(Number)
        .sort((left, right) => left - right),
    );
    setReviewedHash(null);
    closeReadinessConfirmation();
  }

  async function resetLocalReadinessReview() {
    if (isReadinessDirty) {
      readinessReturnFocusRef.current =
        document.activeElement as HTMLButtonElement;
      setReadinessConfirmation("reset");
      return;
    }
    await performLocalReadinessReset();
  }

  async function performLocalReadinessReset() {
    if (readinessConfirmation === "reset") closeReadinessConfirmation();
    await runOperation(
      OPERATION.READINESS_MANIFEST,
      fetchCompleteReadinessManifest,
      ({ first, pages, rows }) => {
        const freshRows = Object.fromEntries(
          rows.map((row) => [row.stableId, row]),
        );
        setReadinessRows(freshRows);
        setReadinessServerRows(freshRows);
        setReadinessPages(pages);
        setReadinessManifest(first);
        setReadinessCursor(0);
        setReviewedReadinessPages([]);
        setReviewReason("");
        setReviewedHash(null);
        toast.success(
          "Revisión local restablecida con valores frescos del servidor.",
        );
      },
    );
  }

  async function confirmAction() {
    if (!confirmation || !reason.trim()) return;
    if (
      confirmation === "acl-baseline" &&
      (!aclPreview || !hasExactAclPreviewPair || !captureAuthorizationId.trim())
    )
      return;
    if (confirmation === "projection-retry" && !retryPaymentId) return;
    const selectedConfirmation = confirmation;
    const operation =
      selectedConfirmation === "register"
        ? OPERATION.REGISTER
        : selectedConfirmation === "acl-baseline"
          ? OPERATION.ACL_CAPTURE
          : selectedConfirmation === "provision"
            ? OPERATION.PROVISION
            : selectedConfirmation === "projection-retry"
              ? OPERATION.PROJECTION_RETRY
              : OPERATION.TRANSITION;
    const succeeded = await runOperation(
      operation,
      async (signal) => {
        if (selectedConfirmation === "register")
          await driveHierarchyApi.registerRoot(
            {
              reason: reason.trim(),
              confirmPreparing: true,
            },
            signal,
          );
        if (selectedConfirmation === "acl-baseline" && aclPreview)
          await driveHierarchyApi.captureAclBaseline(
            {
              reason: reason.trim(),
              confirmCapture: true,
              expectedInventoryHash: aclPreview.inventoryHash,
              expectedManifestHash: aclPreview.manifestHash,
              authorizationId: captureAuthorizationId.trim(),
              previewTokens: [
                previousAclPreview?.previewToken ?? "",
                aclPreview.previewToken,
              ],
            },
            signal,
          );
        if (selectedConfirmation === "provision" && plan)
          await driveHierarchyApi.provision(plan, reason.trim(), signal);
        if (selectedConfirmation === "transition")
          await driveHierarchyApi.transition(
            {
              status: targetStatus,
              reason: reason.trim(),
            },
            signal,
          );
        if (selectedConfirmation === "projection-retry" && retryPaymentId)
          await driveHierarchyApi.retryPaymentProjection(
            retryPaymentId,
            { reason: reason.trim() },
            signal,
          );
        return undefined;
      },
      () => {
        toast.success("Operación registrada correctamente.");
        setConfirmation(null);
        setReason("");
        setCaptureAuthorizationId("");
        setAclPreview(null);
        setPreviousAclPreview(null);
        setPlan(null);
        setPreflight(null);
        setRetryPaymentId(null);
      },
    );
    if (succeeded) load();
  }

  const errors = nodes.filter((node) => node.last_error_at);

  return (
    <div className="space-y-6" aria-busy={isBusy}>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FolderTree className="h-6 w-6" /> Jerarquía contable de Drive
        </h1>
        <p className="text-muted-foreground">
          Estado persistido y preflight de la carpeta raíz SIG dentro del Shared
          Drive configurado.
        </p>
      </div>

      <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <div className="flex gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <strong>PREPARING no activa el archivado automático.</strong> Las
            operaciones se muestran antes de confirmar. Esta pantalla no usa
            flags ni cambia la raíz configurada.
          </p>
        </div>
      </div>

      {canIssueReadiness && (
        <Card>
          <CardHeader>
            <CardTitle>Autorizaciones de preparación Drive</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Emite IDs de un solo uso por cinco minutos. Permanecen solo en
              memoria en esta pantalla: cópialos al gestor objetivo y cambia de
              sesión. El emisor no puede consumir FREEZE, CAPTURE ni READY.
            </p>
            {role === ROLE_CODE.ADMIN_SISTEMA && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950">
                READY debe dirigirse a un gestor distinto del gestor que
                consumió CAPTURE. PostgreSQL vuelve a validar esta separación.
              </p>
            )}
            <select
              aria-label="Propósito de autorización"
              className="h-9 rounded-md border bg-background px-3"
              value={authorizationPurpose}
              disabled={isBusy}
              onChange={(event) => {
                setAuthorizationPurpose(
                  event.target.value as DriveReadinessAuthorizationPurpose,
                );
                setIssuedAuthorization(null);
              }}
            >
              {role === ROLE_CODE.AUDITOR_DIRECCION && (
                <>
                  <option value="FREEZE">FREEZE</option>
                  <option value="CAPTURE">CAPTURE</option>
                </>
              )}
              {role === ROLE_CODE.ADMIN_SISTEMA && (
                <option value="READY">READY</option>
              )}
            </select>
            <select
              aria-label="Gestor objetivo"
              className="h-9 rounded-md border bg-background px-3"
              value={authorizationTargetId}
              disabled={isBusy}
              onChange={(event) => {
                setAuthorizationTargetId(event.target.value);
                setIssuedAuthorization(null);
              }}
            >
              <option value="">Selecciona un gestor</option>
              {authorizationTargets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.displayName}
                </option>
              ))}
            </select>
            {authorizationPurpose !== "READY" && (
              <Input
                aria-label="Hash del manifiesto autorizado"
                value={authorizationManifestHash}
                onChange={(event) =>
                  setAuthorizationManifestHash(event.target.value)
                }
                placeholder="Hash SHA-256 del manifiesto"
                disabled={isBusy}
              />
            )}
            {authorizationPurpose === "CAPTURE" && (
              <>
                <Input
                  aria-label="Hash del inventario autorizado"
                  value={authorizationInventoryHash}
                  onChange={(event) =>
                    setAuthorizationInventoryHash(event.target.value)
                  }
                  placeholder="Hash SHA-256 del inventario ACL"
                  disabled={isBusy}
                />
                <Textarea
                  aria-label="Tokens de preview autorizados"
                  value={authorizationPreviewTokens}
                  onChange={(event) =>
                    setAuthorizationPreviewTokens(event.target.value)
                  }
                  placeholder="Dos tokens, uno por línea"
                  disabled={isBusy}
                />
                <p className="text-muted-foreground">
                  CAPTURE se emite con el hash de inventario, el hash del
                  manifiesto y exactamente dos previews vigentes producidos por
                  el gestor que realizará la captura.
                </p>
              </>
            )}
            {authorizationPurpose === "READY" && (
              <Textarea
                aria-label="Evidencias READY autorizadas"
                value={authorizationEvidenceIds}
                onChange={(event) =>
                  setAuthorizationEvidenceIds(event.target.value)
                }
                placeholder="Siete UUID separados por coma"
                disabled={isBusy}
              />
            )}
            <Textarea
              aria-label="Razón de autorización"
              value={authorizationReason}
              onChange={(event) => setAuthorizationReason(event.target.value)}
              maxLength={500}
              disabled={isBusy}
            />
            <Button
              onClick={() => void issueReadinessAuthorization()}
              disabled={
                isBusy ||
                !authorizationTargetId ||
                !authorizationReason.trim() ||
                !isAuthorizationBindingValid
              }
            >
              Emitir autorización
            </Button>
            {issuedAuthorization && (
              <div className="space-y-2 rounded-md border p-3">
                <p>
                  {issuedAuthorization.purpose} · vence{" "}
                  {new Date(issuedAuthorization.expiresAt).toLocaleString(
                    "es-PE",
                  )}
                </p>
                <p className="break-all font-mono text-xs">
                  {issuedAuthorization.authorizationId}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      void copyTransientValue(
                        issuedAuthorization.authorizationId,
                        "ID de autorización",
                      )
                    }
                  >
                    Copiar ID
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void revokeReadinessAuthorization()}
                    disabled={isBusy || !authorizationReason.trim()}
                  >
                    Revocar autorización
                  </Button>
                </div>
              </div>
            )}
            {role === ROLE_CODE.AUDITOR_DIRECCION && (
              <div className="space-y-2 rounded-md border border-amber-300 p-3">
                <h3 className="font-semibold">
                  Autorizar prueba reparent real
                </h3>
                <p className="text-muted-foreground">
                  Vincula por cinco minutos el plan exacto a un gestor distinto.
                  El ID es transitorio y no autoriza READY.
                </p>
                <Input
                  aria-label="Hash del plan reparent autorizado"
                  value={reparentIssuerPlanHash}
                  onChange={(event) =>
                    setReparentIssuerPlanHash(event.target.value)
                  }
                  placeholder="Hash SHA-256 copiado por el gestor"
                  disabled={isBusy}
                />
                <Button
                  variant="outline"
                  onClick={() => void issueReparentAuthorization()}
                  disabled={
                    isBusy ||
                    !authorizationTargetId ||
                    !SHA256_PATTERN.test(reparentIssuerPlanHash) ||
                    !authorizationReason.trim()
                  }
                >
                  Autorizar prueba reparent
                </Button>
                {issuedReparentAuthorization && (
                  <div>
                    <p>
                      Vence en{" "}
                      {Math.max(
                        0,
                        Math.floor(
                          (new Date(
                            issuedReparentAuthorization.expiresAt,
                          ).getTime() -
                            clockMs) /
                            1_000,
                        ),
                      )}{" "}
                      s
                    </p>
                    <p className="break-all font-mono text-xs">
                      {issuedReparentAuthorization.authorizationId}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() =>
                        void copyTransientValue(
                          issuedReparentAuthorization.authorizationId,
                          "ID reparent",
                        )
                      }
                    >
                      Copiar ID reparent
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Prueba reparent descartable y bundle READY</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="rounded-md border border-red-300 bg-red-50 p-3 text-red-950">
              Esta prueba crea una carpeta descartable bajo NO-ASIGNADOS, mueve
              solo esa carpeta a 01.Enero, la restaura y la envía a la papelera.
              Nunca mueve ni elimina los cuatro IDs canónicos; no invoca B3 ni
              cambia PREPARING.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => void loadReparentPlan()}
                disabled={isBusy}
              >
                Ver plan sin mutar
              </Button>
              <Button
                variant="outline"
                onClick={() => void refreshReadyStatus()}
                disabled={isBusy}
              >
                Actualizar estado 0–7
              </Button>
            </div>
            {reparentPlan && (
              <div className="space-y-2 rounded-md border p-3">
                <p>
                  {reparentPlan.originalParent.name} →{" "}
                  {reparentPlan.temporaryParent.name} → restaurar → trash
                </p>
                <p className="break-all font-mono text-xs">
                  Plan: {reparentPlan.planHash}
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    void copyTransientValue(
                      reparentPlan.planHash,
                      "Hash del plan",
                    )
                  }
                >
                  Copiar hash para Auditor
                </Button>
                <Input
                  aria-label="ID de autorización reparent"
                  value={reparentAuthorizationId}
                  onChange={(event) =>
                    setReparentAuthorizationId(event.target.value)
                  }
                  placeholder="UUID de autorización vigente"
                  disabled={isBusy}
                />
                <label className="flex items-start gap-2 rounded-md border border-red-300 p-3">
                  <input
                    aria-label="Confirmar mutación real create move restore trash"
                    type="checkbox"
                    checked={reparentConfirmed}
                    onChange={(event) =>
                      setReparentConfirmed(event.target.checked)
                    }
                    disabled={isBusy}
                  />
                  Confirmo explícitamente las cuatro operaciones reales: CREATE,
                  MOVE, RESTORE y TRASH de la canary descartable.
                </label>
                <Textarea
                  aria-label="Razón para ejecutar prueba reparent"
                  value={reparentRunReason}
                  onChange={(event) => setReparentRunReason(event.target.value)}
                  placeholder="Razón auditada de la prueba"
                  disabled={isBusy}
                />
                <Button
                  variant="destructive"
                  onClick={() => void executeReparentProof()}
                  disabled={
                    isBusy ||
                    !UUID_PATTERN.test(reparentAuthorizationId) ||
                    !reparentRunReason.trim() ||
                    !reparentConfirmed
                  }
                >
                  Ejecutar prueba real confirmada
                </Button>
              </div>
            )}
            {reparentRun && (
              <div className="space-y-2 rounded-md border p-3">
                <p role="status">
                  Etapa de prueba: <strong>{reparentRun.stage}</strong>
                </p>
                <p>Próxima acción: {reparentRun.nextAction}</p>
                {reparentRun.issueCode && (
                  <p>Código: {reparentRun.issueCode}</p>
                )}
                {reparentRun.stage === "RECOVERY_REQUIRED" && (
                  <>
                    <Textarea
                      aria-label="Razón de recuperación reparent"
                      value={reparentRecoveryReason}
                      onChange={(event) =>
                        setReparentRecoveryReason(event.target.value)
                      }
                      placeholder="Razón auditada"
                      disabled={isBusy}
                    />
                    <Button
                      variant="destructive"
                      onClick={() => void recoverReparentProof()}
                      disabled={isBusy || !reparentRecoveryReason.trim()}
                    >
                      Recuperar solo restaurando/eliminando
                    </Button>
                  </>
                )}
              </div>
            )}
            <div className="space-y-2 rounded-md border p-3">
              <p>
                Gates READY:{" "}
                <strong>{readyStatus?.completeCount ?? 0}/7</strong>
                {readyStatus?.minimumExpiresAt
                  ? ` · TTL mínimo ${Math.max(0, Math.floor((new Date(readyStatus.minimumExpiresAt).getTime() - clockMs) / 1_000))} s`
                  : ""}
              </p>
              <ul>
                {(readyStatus?.gates ?? []).map((gate) => (
                  <li key={gate.gate}>
                    {gate.gate}: {gate.state}
                    {gate.issueCodes.length
                      ? ` (${gate.issueCodes.join(", ")})`
                      : ""}
                  </li>
                ))}
              </ul>
              <Textarea
                aria-label="Razón para producir bundle READY"
                value={bundleReason}
                onChange={(event) => setBundleReason(event.target.value)}
                placeholder="Razón de producción; no cambia ciclo de vida"
                disabled={isBusy}
              />
              <Button
                onClick={() => void produceReadyBundle()}
                disabled={
                  isBusy ||
                  reparentRun?.stage !== "CLEANED" ||
                  !bundleReason.trim()
                }
              >
                Producir bundle READY
              </Button>
              <p className="text-muted-foreground">
                El bundle no ejecuta otra canary, no emite autorización READY y
                no cambia a READY/ACTIVE. Los siete IDs solo se autocompletan al
                validar orden y completitud exactos.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Preparación y consumo de autorizaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <p className="font-medium">
              Revisar → reconciliar → congelar → previsualizar → capturar →
              READY
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  reconciliation?.manifest_hash ? "secondary" : "outline"
                }
              >
                {reconciliation?.manifest_hash
                  ? "Manifiesto revisado"
                  : "Revisión pendiente"}
              </Badge>
              <Badge
                variant={reconciliation?.reconciled ? "secondary" : "outline"}
              >
                {reconciliation?.reconciled
                  ? "Reconciliación completa"
                  : "Reconciliación pendiente"}
              </Badge>
              <Badge variant={reconciliation?.frozen ? "secondary" : "outline"}>
                {reconciliation?.frozen
                  ? "Topología congelada"
                  : "FREEZE pendiente"}
              </Badge>
            </div>
            {reconciliationLoading && (
              <p role="status">Consultando reconciliación…</p>
            )}
            <div className="space-y-2 rounded-md border p-3">
              <h3 className="font-semibold">
                Ejecutar FREEZE como gestor objetivo
              </h3>
              <p className="text-muted-foreground">
                Usa el ID emitido por Auditor/Dirección para esta cuenta exacta.
                Caduca a los cinco minutos y solo sirve para FREEZE.
              </p>
              <Input
                aria-label="Hash revisado para FREEZE"
                value={reconciliation?.manifest_hash ?? ""}
                readOnly
                placeholder="Disponible después de revisar y reconciliar"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  void copyTransientValue(
                    reconciliation?.manifest_hash ?? "",
                    "Hash revisado",
                  )
                }
                disabled={!reconciliation?.manifest_hash}
              >
                Copiar hash para emisión FREEZE
              </Button>
              <Input
                aria-label="ID de autorización FREEZE"
                value={freezeAuthorizationId}
                onChange={(event) =>
                  setFreezeAuthorizationId(event.target.value)
                }
                placeholder="ID FREEZE vigente"
                disabled={isBusy || reconciliation?.frozen === true}
              />
              <Textarea
                aria-label="Razón de FREEZE"
                value={freezeReason}
                onChange={(event) => setFreezeReason(event.target.value)}
                maxLength={500}
                disabled={isBusy || reconciliation?.frozen === true}
              />
              <Button
                onClick={() => void executeFreeze()}
                disabled={
                  isBusy ||
                  reconciliation?.reconciled !== true ||
                  reconciliation?.frozen === true ||
                  !SHA256_PATTERN.test(reconciliation?.manifest_hash ?? "") ||
                  !freezeAuthorizationId.trim() ||
                  !freezeReason.trim()
                }
              >
                Ejecutar FREEZE
              </Button>
            </div>
            <div className="space-y-2 rounded-md border p-3">
              <h3 className="font-semibold">Transición READY</h3>
              <p className="text-muted-foreground">
                El administrador emite READY a un gestor distinto del que
                consumió CAPTURE. El endpoint de ciclo de vida consume el ID de
                forma atómica; esta pantalla no expone ACTIVE.
              </p>
              <Textarea
                aria-label="Evidencias READY para consumo"
                value={readyEvidenceIds}
                onChange={(event) => setReadyEvidenceIds(event.target.value)}
                placeholder="Siete UUID únicos separados por coma"
                disabled={isBusy}
              />
              <p className="text-muted-foreground">
                Evidencias válidas: {parsedReadyEvidenceIds.length}/7.
              </p>
              <Input
                aria-label="ID de autorización READY"
                value={readyAuthorizationId}
                onChange={(event) =>
                  setReadyAuthorizationId(event.target.value)
                }
                placeholder="ID READY vigente"
                disabled={isBusy}
              />
              <Textarea
                aria-label="Razón de READY"
                value={readyReason}
                onChange={(event) => setReadyReason(event.target.value)}
                maxLength={500}
                disabled={isBusy}
              />
              <Button
                onClick={() => void executeReady()}
                disabled={
                  isBusy ||
                  !hasSevenValidReadyEvidenceIds ||
                  !UUID_PATTERN.test(readyAuthorizationId.trim()) ||
                  !readyReason.trim()
                }
              >
                Marcar READY
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {readStatus.root === "success" &&
        rootStatus &&
        rootStatus.root?.lifecycle_status !==
          DRIVE_HIERARCHY_LIFECYCLE.ACTIVE && (
          <div
            role="alert"
            className="rounded-md border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-950"
          >
            <p className="flex items-start gap-2 font-semibold">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              La automatización de movimiento está detenida: estado{" "}
              {rootStatus.root?.lifecycle_status ?? "SIN RAÍZ"}.
            </p>
            <p className="mt-1">
              No se inician reclamos ni llamadas nuevas a Drive mientras el
              ciclo no sea ACTIVE. La activación no forma parte de esta
              pantalla.
            </p>
          </div>
        )}

      {canViewHierarchy && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Raíz y ciclo de vida</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={isBusy}
              aria-busy={isReadBusy}
            >
              {isReadBusy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              {isReadBusy ? "Actualizando…" : "Actualizar"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {(readStatus.root === "idle" || readStatus.root === "loading") && (
              <p role="status" className="text-sm text-muted-foreground">
                Cargando estado de la jerarquía...
              </p>
            )}
            {readStatus.root === "error" && (
              <p role="alert" className="text-sm text-destructive">
                {READ_ERROR_MESSAGE.root}
              </p>
            )}
            {readStatus.root === "success" && rootStatus && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge
                    variant={rootStatus.registered ? "secondary" : "outline"}
                  >
                    {rootStatus.root?.lifecycle_status ?? "SIN RAÍZ REGISTRADA"}
                  </Badge>
                  <span className="font-mono text-xs">
                    {rootStatus.root?.drive_folder_id ??
                      rootStatus.configuredRootId}
                  </span>
                </div>
                {!rootStatus.registered && (
                  <p className="text-sm text-muted-foreground">
                    No hay raíz persistida. El comportamiento legado continúa
                    sin cambios.
                  </p>
                )}
                {!canManage && (
                  <p className="text-sm text-muted-foreground">
                    Vista de solo lectura. Solo GIOF Manager puede registrar,
                    provisionar o cambiar el ciclo de vida.
                  </p>
                )}
                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    {!rootStatus.registered && (
                      <Button
                        variant="outline"
                        onClick={() => void runPreflight()}
                        disabled={isBusy}
                        aria-busy={activeOperation === OPERATION.PREFLIGHT}
                      >
                        {activeOperation === OPERATION.PREFLIGHT && (
                          <LoaderCircle className="animate-spin" />
                        )}
                        {activeOperation === OPERATION.PREFLIGHT
                          ? "Verificando…"
                          : "Ejecutar preflight"}
                      </Button>
                    )}
                    {!rootStatus.registered && (
                      <Button
                        onClick={() => setConfirmation("register")}
                        disabled={isBusy || preflight?.passes !== true}
                      >
                        Registrar como PREPARING
                      </Button>
                    )}
                    {rootStatus.registered && (
                      <>
                        <select
                          aria-label="Estado de ciclo de vida"
                          className="h-9 rounded-md border bg-background px-3 text-sm"
                          value={targetStatus}
                          disabled={isBusy}
                          onChange={(event) =>
                            setTargetStatus(
                              event.target.value as DriveHierarchyLifecycle,
                            )
                          }
                        >
                          {LIFECYCLE_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        <Button
                          variant="outline"
                          onClick={() => setConfirmation("transition")}
                          disabled={isBusy}
                        >
                          Cambiar estado
                        </Button>
                      </>
                    )}
                  </div>
                )}
                {preflight && (
                  <div className="rounded-md border p-3 text-sm">
                    <p className="flex items-center gap-2 font-medium">
                      {preflight.passes ? (
                        <CheckCircle2 className="text-emerald-600" />
                      ) : (
                        <AlertTriangle className="text-amber-600" />
                      )}
                      {preflight.passes
                        ? "Preflight aprobado"
                        : "Preflight bloqueado"}
                    </p>
                    {preflight.issues.length > 0 && (
                      <p className="mt-2 text-destructive">
                        {preflight.issues.map((issue) => (
                          <span key={issue} className="block">
                            {issueMessage(issue)}{" "}
                            <span className="font-mono text-xs text-muted-foreground">
                              ({issue})
                            </span>
                          </span>
                        ))}
                      </p>
                    )}
                    {preflight.guidance?.map((item) => (
                      <p key={item} className="mt-2 text-muted-foreground">
                        {item ===
                        "Preview the exact full-tree ACL inventory, review its scope, count, hash and preserved direct grants, then explicitly capture the initial baseline."
                          ? "Previsualiza el inventario ACL completo, revisa su alcance, conteo, hash y accesos directos preservados; luego confirma explícitamente la captura inicial."
                          : item}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {canManage &&
        readStatus.root === "success" &&
        rootStatus?.registered &&
        rootStatus.root?.lifecycle_status ===
          DRIVE_HIERARCHY_LIFECYCLE.PREPARING && (
          <Card>
            <CardHeader>
              <CardTitle>
                Revisión B1 del manifiesto
                {readinessManifest
                  ? ` (${readinessManifest.totalCount} ítems)`
                  : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Vista paginada y sanitizada. Los cuatro IDs canónicos están
                forzados a KEEP. El CSV se genera en el servidor con todas las
                decisiones locales del manifiesto y no las registra. La
                limpieza, reconciliación, freeze, captura y READY requieren
                autorizaciones separadas y no se ejecutan desde esta vista.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => void loadReadinessManifest()}
                  disabled={isBusy}
                >
                  Cargar manifiesto
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void exportReadinessManifest()}
                  disabled={isBusy || !isLocalReadinessReviewComplete}
                >
                  {activeOperation === OPERATION.READINESS_EXPORT
                    ? "Exportando CSV…"
                    : "Exportar revisión local en CSV"}
                </Button>
              </div>
              {readinessManifest && (
                <div className="space-y-3">
                  <p>
                    KEEP {localReadinessKeepCount} · DELETE{" "}
                    {localReadinessDeleteCount} ·{" "}
                    {orderedReadinessRows.length ===
                    readinessManifest.totalCount
                      ? `total ${orderedReadinessRows.length} · cobertura completa`
                      : `total cargado ${orderedReadinessRows.length} · cobertura ${orderedReadinessRows.length}/${readinessManifest.totalCount}`}
                  </p>
                  <p>
                    DELETE bloqueados por referencias:{" "}
                    {blockedReadinessDeleteCount}. El estado de referencia es
                    calculado por el servidor y no se puede editar.
                  </p>
                  <p className="break-all font-mono text-xs">
                    Hash: {readinessManifest.hash}
                  </p>
                  <div className="max-h-72 overflow-auto rounded-md border">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-muted">
                        <tr>
                          <th className="p-2">#</th>
                          <th className="p-2">Ruta relativa</th>
                          <th className="p-2">Tipo</th>
                          <th className="p-2">Decisión</th>
                          <th className="p-2">Motivo</th>
                          <th className="p-2">Referencia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {readinessManifest.rows.map((serverRow) => {
                          const row =
                            readinessRows[serverRow.stableId] ?? serverRow;
                          const canonical =
                            row.reasonCode === "CANONICAL_REQUIRED";
                          return (
                            <tr key={row.stableId} className="border-t">
                              <td className="p-2">{row.sequence}</td>
                              <td className="p-2">{row.relativePath}</td>
                              <td className="p-2">{row.itemType}</td>
                              <td className="p-2">
                                <select
                                  aria-label={`Decisión ${row.sequence}`}
                                  className="h-9 rounded-md border bg-background px-2"
                                  value={row.disposition}
                                  disabled={isBusy || canonical}
                                  onChange={(event) =>
                                    updateReadinessRow(row.stableId, {
                                      disposition: event.target.value as
                                        "KEEP" | "DELETE",
                                    })
                                  }
                                >
                                  <option value="KEEP">KEEP</option>
                                  <option value="DELETE">DELETE</option>
                                </select>
                              </td>
                              <td className="p-2">
                                <Input
                                  aria-label={`Motivo ${row.sequence}`}
                                  value={row.reasonCode}
                                  disabled={isBusy || canonical}
                                  onChange={(event) =>
                                    updateReadinessRow(row.stableId, {
                                      reasonCode: event.target.value
                                        .toUpperCase()
                                        .replace(/[^A-Z0-9_:-]/g, "")
                                        .slice(0, 80),
                                    })
                                  }
                                />
                              </td>
                              <td className="p-2">
                                <span className="font-medium">
                                  {row.referenceStatus}
                                </span>
                                {(row.referenceDetails?.length ?? 0) > 0 && (
                                  <ul className="mt-1 space-y-1 text-xs text-destructive">
                                    {(row.referenceDetails ?? []).map(
                                      (detail) => (
                                        <li
                                          key={`${detail.code}:${detail.sourceType}:${detail.sourceId}`}
                                        >
                                          {detail.code} · {detail.sourceType} ·{" "}
                                          {detail.sourceId}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={
                        isBusy ||
                        orderedReadinessRows.length !==
                          readinessManifest.totalCount ||
                        editableReadinessCount === 0
                      }
                      onClick={markAllNonCanonicalDelete}
                    >
                      Marcar los {editableReadinessCount} no canónicos como
                      DELETE
                    </Button>
                    <Button
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => void resetLocalReadinessReview()}
                    >
                      Restablecer revisión local
                    </Button>
                    <Button
                      variant="outline"
                      disabled={isBusy}
                      onClick={markCurrentReadinessPageReviewed}
                    >
                      Marcar página revisada
                    </Button>
                    <Button
                      variant="outline"
                      disabled={isBusy || readinessCursor === 0}
                      onClick={() => {
                        const previousCursor = Object.keys(readinessPages)
                          .map(Number)
                          .filter((cursor) => cursor < readinessCursor)
                          .sort((left, right) => right - left)[0];
                        if (previousCursor !== undefined)
                          showReadinessPage(previousCursor);
                      }}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      disabled={isBusy || readinessManifest.nextCursor === null}
                      onClick={() => {
                        if (readinessManifest.nextCursor !== null)
                          showReadinessPage(readinessManifest.nextCursor);
                      }}
                    >
                      Siguiente
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <p>
                      Ítems cargados: {orderedReadinessRows.length}/
                      {readinessManifest.totalCount}.
                    </p>
                    <p>
                      Páginas revisadas: {reviewedReadinessPages.length}/
                      {readinessPageCount}.
                    </p>
                    <p className="text-muted-foreground">
                      Recorre todas las páginas y marca cada una explícitamente
                      antes de registrar la revisión.
                    </p>
                  </div>
                  <label className="block space-y-1">
                    <span>Razón de la revisión</span>
                    <Textarea
                      aria-label="Razón de la revisión del manifiesto"
                      value={reviewReason}
                      onChange={(event) => setReviewReason(event.target.value)}
                      disabled={isBusy}
                      maxLength={500}
                    />
                  </label>
                  <Button
                    onClick={() => void submitReadinessReview()}
                    disabled={
                      isBusy ||
                      Object.keys(readinessRows).length !==
                        readinessManifest.totalCount ||
                      !reviewReason.trim() ||
                      blockedReadinessDeleteCount > 0 ||
                      Object.values(readinessRows).some(
                        (row) => row.reasonCode === "REVIEW_REQUIRED",
                      )
                    }
                  >
                    {activeOperation === OPERATION.READINESS_REVIEW
                      ? "Registrando revisión…"
                      : "Registrar revisión del manifiesto"}
                  </Button>
                  {reviewedHash && (
                    <p role="status" className="text-emerald-700">
                      Revisión registrada. Hash: {reviewedHash}. No se ejecutó
                      limpieza.
                    </p>
                  )}
                  <p className="rounded-md border bg-muted p-3">
                    Estado operacional: revisión local no persistida hasta
                    Registrar · limpieza no autorizada · reconciliación
                    pendiente · topología no congelada · previews 0/2 · baseline
                    no capturado.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

      {canManage &&
        readStatus.root === "success" &&
        rootStatus?.registered &&
        nodesKnown &&
        !canaryComplete && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            Siguiente paso: previsualiza y confirma el canary seguro. La
            revisión ACL se habilitará después de verificar sus nodos.
          </p>
        )}

      {canManage &&
        readStatus.root === "success" &&
        rootStatus?.registered &&
        canaryComplete && (
          <Card>
            <CardHeader>
              <CardTitle>Baseline ACL exacto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Inventario de solo lectura del árbol SIG completo. No cambia
                permisos y solo permite la captura inicial aprobada.
              </p>
              {(!reconciliation?.reconciled || !reconciliation?.frozen) && (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  El baseline permanece bloqueado hasta completar la revisión,
                  confirmar la reconciliación y ejecutar FREEZE con el gestor
                  objetivo.
                </p>
              )}
              {isAclInventoryBusy && (
                <p
                  role="status"
                  aria-live="polite"
                  className="text-sm font-medium text-muted-foreground"
                >
                  {ACL_INVENTORY_PROGRESS}
                </p>
              )}
              <Button
                variant="outline"
                onClick={() => void previewAclBaseline()}
                disabled={
                  isBusy ||
                  reconciliation?.reconciled !== true ||
                  reconciliation?.frozen !== true
                }
                aria-busy={activeOperation === OPERATION.ACL_PREVIEW}
              >
                {activeOperation === OPERATION.ACL_PREVIEW
                  ? ACL_INVENTORY_PROGRESS
                  : "Previsualizar baseline ACL"}
              </Button>
              {aclPreview && (
                <div className="space-y-3 rounded-md border p-3 text-sm">
                  <p>
                    Alcance: <strong>{aclPreview.nodeCount} nodos</strong> ·
                    raíz v{aclPreview.rootRevision} ·{" "}
                    {aclPreview.directGrantCount} grants directos preservados
                    (sin exponer principales)
                  </p>
                  <p className="break-all font-mono text-xs">
                    Hash: {aclPreview.inventoryHash}
                  </p>
                  <p className="font-mono text-xs">
                    Topología: {aclPreview.topologyHash} · ACL:{" "}
                    {aclPreview.aclHash}
                  </p>
                  <p>
                    Previews firmados idénticos:{" "}
                    {hasExactAclPreviewPair ? "2/2" : "1/2"}
                  </p>
                  {previousAclPreview && hasExactAclPreviewPair && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void copyTransientValue(
                          JSON.stringify({
                            manifestHash: aclPreview.manifestHash,
                            inventoryHash: aclPreview.inventoryHash,
                            previewTokens: [
                              previousAclPreview.previewToken,
                              aclPreview.previewToken,
                            ],
                          }),
                          "Datos CAPTURE",
                        )
                      }
                    >
                      Copiar datos para emisión CAPTURE
                    </Button>
                  )}
                  <Button
                    onClick={() => setConfirmation("acl-baseline")}
                    disabled={isBusy || !hasExactAclPreviewPair}
                  >
                    Capturar baseline inicial
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

      {canManage && readStatus.root === "success" && rootStatus?.registered && (
        <Card>
          <CardHeader>
            <CardTitle>Plan de aprovisionamiento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 text-sm">
                <span>Año</span>
                <Input
                  type="number"
                  min={2000}
                  max={2100}
                  value={year}
                  onChange={(event) => setYear(Number(event.target.value))}
                  disabled={isBusy}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Mes opcional</span>
                <select
                  aria-label="Mes opcional"
                  className="h-9 rounded-md border bg-background px-3"
                  value={month ?? ""}
                  onChange={(event) =>
                    setMonth(
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                  disabled={isBusy || !canaryComplete}
                >
                  <option value="">Año completo</option>
                  {Array.from({ length: 12 }, (_, index) => index + 1).map(
                    (value) => (
                      <option key={value} value={value}>
                        {String(value).padStart(2, "0")}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
                <input
                  type="checkbox"
                  checked={canary}
                  onChange={(event) => setCanary(event.target.checked)}
                  disabled={isBusy || !canaryComplete}
                />
                Canary seguro: solo año, 01.Enero y NO-ASIGNADOS
              </label>
              <Button
                onClick={() => void previewPlan()}
                disabled={isBusy}
                aria-busy={activeOperation === OPERATION.PLAN}
              >
                {activeOperation === OPERATION.PLAN
                  ? "Preparando vista previa…"
                  : "Previsualizar sin mutar"}
              </Button>
            </div>
            {plan && (
              <div className="space-y-3" data-testid="drive-provision-plan">
                <p className="text-sm">
                  <strong>{plan.createCount}</strong> carpetas por crear;{" "}
                  <strong>{plan.reuseCount}</strong> existentes por reutilizar.
                </p>
                <div className="max-h-72 overflow-auto rounded-md border">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="p-2">Operación</th>
                        <th className="p-2">Nombre</th>
                        <th className="p-2">Clave lógica</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.mutations.map((item) => (
                        <tr key={item.logicalKey} className="border-t">
                          <td className="p-2">
                            <Badge
                              variant={
                                item.operation === "CREATE_FOLDER"
                                  ? "default"
                                  : "outline"
                              }
                            >
                              {item.operation}
                            </Badge>
                          </td>
                          <td className="p-2">{item.name}</td>
                          <td className="p-2 font-mono text-xs">
                            {item.logicalKey}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button
                  disabled={isBusy || plan.createCount === 0}
                  onClick={() => setConfirmation("provision")}
                >
                  Confirmar mutaciones mostradas
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {canRenewRuntime && <PaymentTopologyRecoveryCard />}

      {canManage && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Proyecciones de pago</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={isBusy}
              aria-busy={isReadBusy}
            >
              {isReadBusy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              {isReadBusy ? "Actualizando…" : "Actualizar salud"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {(readStatus.health === "idle" ||
              readStatus.health === "loading") && (
              <p role="status" className="text-muted-foreground">
                Cargando salud de proyecciones...
              </p>
            )}
            {readStatus.health === "error" && (
              <p role="alert" className="text-destructive">
                {READ_ERROR_MESSAGE.health}
              </p>
            )}
            {readStatus.health === "success" && projectionHealth && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={projectionHealth.active ? "default" : "outline"}
                  >
                    Worker{" "}
                    {projectionHealth.workerEnabled
                      ? "habilitado"
                      : "deshabilitado"}
                  </Badge>
                  <Badge variant="outline">
                    Ciclo {projectionHealth.lifecycleStatus ?? "SIN RAÍZ"}
                  </Badge>
                  <span>Pendientes: {projectionHealth.counts.PENDING}</span>
                  <span>Procesando: {projectionHealth.counts.PROCESSING}</span>
                  <span>Completadas: {projectionHealth.counts.SUCCEEDED}</span>
                  <span>Fallidas: {projectionHealth.counts.FAILED}</span>
                  <span>
                    Fuente pendiente: {projectionHealth.counts.SOURCE_REQUIRED}
                  </span>
                  <span>Vencidas: {projectionHealth.dueCount}</span>
                </div>
                <p>
                  Antigüedad elegible más antigua:{" "}
                  <strong>
                    {projectionHealth.oldestEligibleLagSeconds === null
                      ? "Sin cola elegible"
                      : `${Math.floor(projectionHealth.oldestEligibleLagSeconds / 3600)} h`}
                  </strong>
                  {projectionHealth.oldestDueAt
                    ? ` · vencida desde ${new Date(projectionHealth.oldestDueAt).toLocaleString("es-PE")}`
                    : ""}
                </p>
                <div className="space-y-3 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">Proceso del worker</p>
                    <Badge
                      variant={
                        projectionHealth.workerProcess?.inFlight
                          ? "secondary"
                          : "outline"
                      }
                    >
                      En vuelo:{" "}
                      {projectionHealth.workerProcess
                        ? projectionHealth.workerProcess.inFlight
                          ? "Sí"
                          : "No"
                        : "No reportado"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Las fechas se muestran en la hora local del navegador.
                  </p>
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Cron</dt>
                      <dd className="font-mono text-xs">
                        {projectionHealth.cronExpression?.trim() ||
                          "No reportado"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Último tick</dt>
                      <dd className="font-medium">
                        {projectionHealth.workerProcess
                          ? localDateTime(
                              projectionHealth.workerProcess.lastTickAt,
                            ) || "Sin ticks registrados"
                          : "No reportado"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Última finalización
                      </dt>
                      <dd className="font-medium">
                        {projectionHealth.workerProcess
                          ? localDateTime(
                              projectionHealth.workerProcess.lastCompletedAt,
                            ) || "Sin finalizaciones registradas"
                          : "No reportado"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Reclamadas en el último lote
                      </dt>
                      <dd className="font-medium">
                        {projectionHealth.workerProcess?.lastBatchClaimed ??
                          "No reportado"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">
                        Procesadas en el último lote
                      </dt>
                      <dd className="font-medium">
                        {projectionHealth.workerProcess?.lastBatchProcessed ??
                          "No reportado"}
                      </dd>
                    </div>
                    {canRenewRuntime && (
                      <div>
                        <dt className="text-muted-foreground">
                          Candidatos reclamables
                        </dt>
                        <dd className="font-medium">
                          {projectionHealth.workerProcess
                            ?.lastClaimableCount ?? "No disponible"}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {canRenewRuntime && projectionHealth.workerProcess && (
                    <div>
                      <p className="font-medium">Motivos de omisión</p>
                      {projectionHealth.workerProcess.lastSkipReasons?.length ? (
                        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                          {projectionHealth.workerProcess.lastSkipReasons.map(
                            (reason) => (
                              <li key={reason}>{reason}</li>
                            ),
                          )}
                        </ul>
                      ) : (
                        <p className="text-muted-foreground">
                          Sin omisiones registradas
                        </p>
                      )}
                    </div>
                  )}
                  {projectionHealth.workerProcess?.lastError ? (
                    <div role="alert" className="rounded-md bg-muted p-3">
                      <p className="font-medium text-destructive">
                        Último error:{" "}
                        {projectionHealth.workerProcess.lastError.code}
                      </p>
                      <p className="text-muted-foreground">
                        {projectionHealth.workerProcess.lastError.message}
                      </p>
                    </div>
                  ) : projectionHealth.workerProcess ? (
                    <p className="text-muted-foreground">
                      Sin errores del proceso registrados.
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      Datos del proceso no reportados por esta respuesta.
                    </p>
                  )}
                </div>
                <ProjectionHealthSummary
                  auditor={projectionHealth.auditor ?? null}
                  callBudget={
                    projectionHealth.callBudget ?? {
                      normal: 1,
                      maximum: 2,
                      lastBatchMaximum: 0,
                    }
                  }
                />
                {(projectionHealth.operationalReasons ?? []).length > 0 ? (
                  <div className="rounded-md border p-3">
                    <p className="font-medium">Bloqueos operativos</p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {(projectionHealth.operationalReasons ?? []).map(
                        (reason) => <li key={reason}>{reason}</li>,
                      )}
                    </ul>
                  </div>
                ) : null}
                {projectionHealth.errors.length > 0 && (
                  <div className="space-y-2">
                    {projectionHealth.errors.map((error) => (
                      <div
                        key={error.paymentId}
                        className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-mono text-xs">{error.paymentId}</p>
                          <p className="font-medium text-destructive">
                            {error.errorCode}
                          </p>
                          <p className="text-muted-foreground">
                            Intentos {error.attemptCount}/{error.maxAttempts}
                            {error.nextAttemptAt
                              ? ` · próximo ${new Date(error.nextAttemptAt).toLocaleString("es-PE")}`
                              : ""}
                          </p>
                        </div>
                        {error.status === "FAILED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRetryPaymentId(error.paymentId);
                              setConfirmation("projection-retry");
                            }}
                            disabled={isBusy}
                          >
                            Reintentar proyección
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {canViewHierarchy && (
        <Card>
          <CardHeader>
            <CardTitle>
              Nodos y errores
              {readStatus.nodes === "success" ? ` (${nodes.length})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(readStatus.nodes === "idle" ||
              readStatus.nodes === "loading") && (
              <p role="status" className="text-sm text-muted-foreground">
                Cargando nodos de la jerarquía...
              </p>
            )}
            {readStatus.nodes === "error" && (
              <p role="alert" className="text-sm text-destructive">
                {READ_ERROR_MESSAGE.nodes}
              </p>
            )}
            {readStatus.nodes === "success" && errors.length > 0 && (
              <p className="text-sm text-destructive">
                {errors.length} nodo(s) con error persistido.
              </p>
            )}
            {readStatus.nodes === "success" && (
              <div className="max-h-80 overflow-auto rounded-md border">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="p-2">Tipo</th>
                      <th className="p-2">Nombre</th>
                      <th className="p-2">Drive ID</th>
                      <th className="p-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.map((node) => (
                      <tr key={node.id} className="border-t">
                        <td className="p-2">{node.node_kind}</td>
                        <td className="p-2">{node.name}</td>
                        <td className="p-2 font-mono text-xs">
                          {node.drive_folder_id ?? "Pendiente"}
                        </td>
                        <td className="p-2">
                          {node.last_error_code ? (
                            <span
                              className="text-destructive"
                              title={node.last_error_message ?? undefined}
                            >
                              {node.last_error_code}
                            </span>
                          ) : (
                            `v${node.version}`
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !isBusy) {
            setConfirmation(null);
            setRetryPaymentId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar operación de Drive</DialogTitle>
            <DialogDescription>
              El servidor produce y firma la evidencia exacta. Esta pantalla
              nunca permite declarar PASS ni cargar evidencia libre.
            </DialogDescription>
          </DialogHeader>
          {confirmation === "provision" && plan && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              Se solicitarán exactamente {plan.createCount} creaciones y{" "}
              {plan.reuseCount} reutilizaciones del plan con hash{" "}
              {plan.planHash.slice(0, 12)}.
            </p>
          )}
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Razón obligatoria"
            aria-label="Razón de la operación"
            disabled={isBusy}
          />
          {confirmation === "acl-baseline" && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Pega el ID CAPTURE emitido para esta cuenta exacta, estos dos
                previews y los hashes mostrados. Caduca a los cinco minutos y no
                puede reutilizarse.
              </p>
              <Input
                value={captureAuthorizationId}
                onChange={(event) =>
                  setCaptureAuthorizationId(event.target.value)
                }
                placeholder="Autorización CAPTURE vigente y de un solo uso"
                aria-label="ID de autorización para captura"
                disabled={isBusy}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmation(null)}
              disabled={isBusy}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void confirmAction()}
              aria-busy={activeOperation === OPERATION.ACL_CAPTURE}
              disabled={
                isBusy ||
                !reason.trim() ||
                (confirmation === "acl-baseline" &&
                  (!aclPreview ||
                    !previousAclPreview ||
                    !captureAuthorizationId.trim()))
              }
            >
              {isBusy && activeOperation
                ? OPERATION_LABEL[activeOperation]
                : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={readinessConfirmation !== null}
        onOpenChange={(open) => {
          if (!open && !isBusy) closeReadinessConfirmation();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {readinessConfirmation === "bulk-delete"
                ? `Confirmar decisión DELETE${editableReadinessCount}`
                : "Confirmar restablecimiento local"}
            </DialogTitle>
            <DialogDescription>
              {readinessConfirmation === "bulk-delete"
                ? `Se marcarán los ${editableReadinessCount} ítems no canónicos como DELETE. La decisión seguirá siendo local hasta Registrar. Los cuatro ítems canónicos permanecerán bloqueados en KEEP.`
                : "Se descartarán todos los cambios, la razón y las páginas revisadas locales. Después se recargará el manifiesto completo desde el servidor."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              autoFocus
              variant="outline"
              onClick={closeReadinessConfirmation}
              disabled={isBusy}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (readinessConfirmation === "bulk-delete") {
                  confirmAllNonCanonicalDelete();
                  return;
                }
                void performLocalReadinessReset();
              }}
              disabled={isBusy}
            >
              {readinessConfirmation === "bulk-delete"
                ? `Confirmar DELETE${editableReadinessCount}`
                : "Confirmar restablecimiento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
