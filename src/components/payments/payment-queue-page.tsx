"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

import { ApiRequestError } from "@/lib/api-client";
import { isPaymentExportReady } from "@/lib/business-queue-export-readiness";
import { ROLE_CODE } from "@/lib/constants";
import {
  downloadPaymentQueueExport,
  getAppliedPaymentQueueFilters,
  savePaymentQueueExport,
} from "@/lib/payment-queue-export";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePaymentQueue, useRetryRexanActivation } from "@/hooks/use-requests";
import { canRejectBankPayment, getApiErrorMessage, getPaymentRexanStatusLabel } from "@/lib/requests";
import { cn } from "@/lib/utils";
import {
  REQUEST_STATUS,
  type PaymentRequest,
  type PaymentQueueRequest,
  type CompletePaymentDetailsResponse,
  type RejectApprovedPaymentResponse,
  type RegisterPaymentResponse,
} from "@/types/requests";
import { useAuthStore } from "@/stores/auth-store";
import {
  PaymentQueueTable,
  isBulkPaymentSelectable,
} from "./payment-queue-table";
import { BulkMarkPaidModal } from "./bulk-mark-paid-modal";
import { RegisterPaymentModal } from "./register-payment-modal";
import { CompletePaymentDetailsModal } from "./complete-payment-details-modal";
import { RejectApprovedPaymentModal } from "./reject-approved-payment-modal";
import { GiofBulkAssignmentBar } from "@/components/giof-work/giof-work-controls";
import { useGiofWorkLeaseSet } from "@/hooks/use-giof-work";
import { useDriveProjectionPolling } from "@/hooks/use-drive-projection-polling";
import {
  canManageGiofAssignments,
  canOperateAssignedGiofWork,
  canRetryGiofWork,
  isGiofManagerRole,
  isGiofOperationalRole,
} from "@/lib/role-capabilities";
import {
  GIOF_BULK_ASSIGNMENT_MODE,
  GIOF_WORK_POOL,
  GIOF_WORK_SCOPE,
  type GiofWorkScope,
} from "@/types/giof-work";
import {
  getGiofCurrentPageSelection,
  isGiofBulkSelectable,
  type GiofBulkSelectableWorkItem,
} from "@/lib/giof-bulk-selection";
import type { GiofWorkLease } from "@/types/giof-work";
import { isGiofLeaseCurrent } from "@/lib/giof-work-lease-session";
import {
  parsePaymentQueueUrl,
  PAYMENT_QUEUE_TAB,
  serializePaymentQueueUrl,
  updatePaymentQueueUrl,
  type PaymentQueueTab,
  type PaymentQueueUrlFilters,
} from "@/lib/queue-filters/payment";
import { QueueFilterReset } from "@/components/queue-filters/queue-filter-reset";
import { PaymentQueueFilters } from "./payment-queue-filters";
import { api } from "@/lib/api-client";
import {
  loadBulkMarkPaidRun,
  removeBulkMarkPaidRun,
  type BulkMarkPaidCommand,
  type BulkMarkPaidRunScope,
  type BulkMarkPaidRunState,
} from "@/lib/bulk-mark-paid-run-storage";
import type { BulkMarkPaidLease } from "@/hooks/use-bulk-mark-paid-orchestrator";
import {
  BULK_PAYMENT_RESULT_STATUS,
  type MarkPaidItemResult,
} from "@/types/requests";
import { getExactPayablePrincipal } from "@/lib/payment-fx";
import { invalidateRequestDomain } from "@/lib/query-tags";

export function getPaymentRegisteredToast(result: RegisterPaymentResponse): {
  title: string;
  description: string;
} {
  return {
    title: `Pago registrado. ${getPaymentRexanStatusLabel(result.rexan_activation.status, false)}.`,
    description:
      "La carpeta de la solicitud se organizará en Drive en segundo plano; puede tardar algunos minutos.",
  };
}

interface PaymentCompletionOperationalContext {
  requestId: string;
  paymentId: string;
  userId: string;
  sessionId: string | null;
  ownerId: string;
  assignmentVersion: string;
  pool: typeof GIOF_WORK_POOL.PAYMENT;
}

function getCanonicalCompletionSnapshot(request: PaymentRequest): string {
  const payment = request.payment;
  return JSON.stringify({
    requestId: request.id,
    requestType: request.request_type,
    status: request.status,
    currency: request.currency,
    requestedAmount: request.requested_amount,
    rexanOutcome: request.rexan_outcome ?? null,
    rexanBalanceAmount: request.rexan_balance_amount ?? null,
    paymentId: payment?.id ?? request.payment_id ?? null,
    paidAt: payment?.paid_at ?? request.paid_at ?? null,
    amountPaid: payment?.amount_paid ?? request.amount_disbursed ?? null,
    sourceAccountKey: payment?.source_account_key ?? null,
    operationReference: payment?.operation_reference ?? null,
    proofDocumentId: payment?.proof_document_id ?? null,
    proofPending:
      payment?.proof_pending ??
      request.payment_proof_pending ??
      request.proof_pending,
    detailsPending:
      payment?.details_pending ??
      request.payment_details_pending ??
      request.details_pending,
    missingFields: [...(payment?.missing_fields ?? [])].sort(),
    valuation: payment?.valuation ?? request.valuation ?? null,
  });
}

function getPaymentCompletionOperationalContext(
  request: PaymentRequest,
  userId: string | undefined,
  sessionId: string | null,
): PaymentCompletionOperationalContext | null {
  const paymentId = request.payment?.id ?? request.payment_id;
  const work = request.giof_work;
  if (
    !userId ||
    !paymentId ||
    !work ||
    work.pool !== GIOF_WORK_POOL.PAYMENT ||
    !work.assigneeId
  )
    return null;
  return {
    userId,
    sessionId,
    requestId: request.id,
    paymentId,
    ownerId: work.assigneeId,
    assignmentVersion: work.assignmentVersion,
    pool: GIOF_WORK_POOL.PAYMENT,
  };
}

export function PaymentQueuePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const sessionExpiresAt = useAuthStore((state) => state.sessionExpiresAt);
  const roleCode = user?.role?.code;
  const isGiofManager = isGiofManagerRole(roleCode);
  const canManageAssignments = canManageGiofAssignments(roleCode);
  const canManagePayments = isGiofOperationalRole(roleCode);
  const canRetryRexan = canRetryGiofWork(roleCode);
  const leaseSet = useGiofWorkLeaseSet((requestId, error) => {
    if (completionRequest?.id !== requestId) return;
    toast.error(error.message);
    setIsCompletionModalOpen(false);
    setCompletionRequest(null);
    setCompletionSnapshot(null);
    setCompletionOperationalContext(null);
    void activeQueue.refetch({ force: true });
  });
  const { retryRexanActivation, isLoading: isRetryingRexan } =
    useRetryRexanActivation();
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(
    null,
  );
  const [paymentOperationalContext, setPaymentOperationalContext] =
    useState<GiofWorkLease | null>(null);
  const [completionRequest, setCompletionRequest] =
    useState<PaymentRequest | null>(null);
  const [completionSnapshot, setCompletionSnapshot] = useState<string | null>(
    null,
  );
  const [completionOperationalContext, setCompletionOperationalContext] =
    useState<PaymentCompletionOperationalContext | null>(null);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>(
    [],
  );
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [bulkRequests, setBulkRequests] = useState<PaymentRequest[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const completionCleanupRef = useRef(new Set<string>());
  const [rejectionRequest, setRejectionRequest] =
    useState<PaymentRequest | null>(null);
  const [rejectionLease, setRejectionLease] = useState<GiofWorkLease | null>(
    null,
  );
  const [isRejectionOpen, setIsRejectionOpen] = useState(false);
  const [bankRejectionIntent, setBankRejectionIntent] = useState(false);
  const [isExportingPayment, setIsExportingPayment] = useState(false);
  const paymentExportControllerRef = useRef<AbortController | null>(null);
  const paymentExportInFlightRef = useRef(false);
  const parsedUrl = parsePaymentQueueUrl(
    new URLSearchParams(searchParams.toString()),
  );
  const urlFilters = parsedUrl.filters;
  const tab = urlFilters.tab ?? PAYMENT_QUEUE_TAB.APPROVED;
  const isPaymentAssignmentSurface =
    tab === PAYMENT_QUEUE_TAB.APPROVED ||
    tab === PAYMENT_QUEUE_TAB.PENDING_DATA ||
    tab === PAYMENT_QUEUE_TAB.PAID;
  const bulkAssignmentMode =
    canManagePayments && isPaymentAssignmentSurface
      ? GIOF_BULK_ASSIGNMENT_MODE.MANAGER_TARGET
      : undefined;
  const roleFilterInvalid = canManageAssignments
    ? false
    : canManagePayments
      ? Boolean(
          urlFilters.assignee_id ||
          (urlFilters.work_scope &&
            urlFilters.work_scope !== GIOF_WORK_SCOPE.ALL &&
            urlFilters.work_scope !== GIOF_WORK_SCOPE.MINE),
        )
      : Boolean(urlFilters.work_scope || urlFilters.assignee_id);
  const hasInvalidUrl =
    parsedUrl.invalidKeys.length > 0 ||
    parsedUrl.unknownKeys.length > 0 ||
    roleFilterInvalid;
  const workScope: GiofWorkScope | undefined = canManagePayments
    ? (urlFilters.work_scope ?? GIOF_WORK_SCOPE.ALL)
    : undefined;
  const workAssigneeId =
    canManageAssignments && workScope === GIOF_WORK_SCOPE.ASSIGNEE
      ? urlFilters.assignee_id
      : undefined;
  const appliedPaymentFilters = getAppliedPaymentQueueFilters(
    urlFilters,
    workScope,
    workAssigneeId,
  );
  const activeQueue = usePaymentQueue(appliedPaymentFilters, {
    enabled: !hasInvalidUrl,
  });
  const displayedRequests = activeQueue.requests;
  const currentBankRequest = bankRejectionIntent
    ? displayedRequests.find(
        (row) => row.id === rejectionRequest?.id &&
          row.payment?.id === rejectionRequest?.payment?.id &&
          canRejectBankPayment(row, roleCode),
      ) ?? null
    : null;
  useEffect(() => {
    if (bankRejectionIntent && isRejectionOpen && !currentBankRequest) {
      setIsRejectionOpen(false);
      setRejectionRequest(null);
      setRejectionLease(null);
    }
  }, [bankRejectionIntent, isRejectionOpen, currentBankRequest]);
  const displayedError = activeQueue.error;
  const displayedIsLoading = activeQueue.isLoading;
  const displayedIsRefreshing = activeQueue.isRefreshing;
  const displayedTotal = activeQueue.total;
  const displayedLimit = activeQueue.limit || 50;
  const page = activeQueue.page;
  const totalPages = Math.max(1, Math.ceil(displayedTotal / displayedLimit));
  const viewIdentity = serializePaymentQueueUrl({
    ...urlFilters,
    work_scope: workScope,
    assignee_id: workAssigneeId,
  }).toString();
  const canonicalQuery = canManagePayments
    ? viewIdentity
    : serializePaymentQueueUrl(urlFilters).toString();
  const rawQuery = searchParams.toString();
  const canExportPayment =
    roleCode === ROLE_CODE.GIOF_GESTOR ||
    roleCode === ROLE_CODE.GIOF_MANAGER ||
    roleCode === ROLE_CODE.AUDITOR_DIRECCION ||
    roleCode === ROLE_CODE.ADMIN_SISTEMA;

  useEffect(
    () => () => paymentExportControllerRef.current?.abort(),
    [viewIdentity, roleCode, user?.id],
  );

  async function exportPaymentExcel(): Promise<void> {
    if (paymentExportInFlightRef.current || !canExportPayment || hasInvalidUrl)
      return;
    const controller = new AbortController();
    paymentExportControllerRef.current = controller;
    paymentExportInFlightRef.current = true;
    setIsExportingPayment(true);
    try {
      const download = await downloadPaymentQueueExport(
        appliedPaymentFilters,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      savePaymentQueueExport(download);
      toast.success("Excel de la Cola de Pagos descargado correctamente.");
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      )
        toast.error("La descarga del Excel fue cancelada.");
      else if (error instanceof ApiRequestError && error.status === 403)
        toast.error("No tienes permisos para exportar la Cola de Pagos.");
      else if (
        error instanceof ApiRequestError &&
        error.status === 422 &&
        error.body.code === "PAYMENT_EXPORT_ROW_LIMIT_EXCEEDED"
      )
        toast.error(
          "El Excel supera el máximo de 10,000 pagos. Ajusta los filtros activos.",
        );
      else if (error instanceof ApiRequestError && error.status === 400)
        toast.error("Revisa los filtros activos antes de exportar el Excel.");
      else
        toast.error(
          "No se pudo descargar el Excel de pagos. Inténtalo nuevamente.",
        );
    } finally {
      if (paymentExportControllerRef.current === controller) {
        paymentExportControllerRef.current = null;
        paymentExportInFlightRef.current = false;
        setIsExportingPayment(false);
      }
    }
  }

  useEffect(() => {
    if (
      !isCompletionModalOpen ||
      !completionRequest ||
      !completionSnapshot ||
      !completionOperationalContext
    )
      return;
    const live = displayedRequests.find(
      (request) => request.id === completionRequest.id,
    );
    const currentSnapshot = live ? getCanonicalCompletionSnapshot(live) : null;
    const currentOperationalContext = live
      ? getPaymentCompletionOperationalContext(live, user?.id, sessionExpiresAt)
      : null;
    if (
      currentSnapshot === completionSnapshot &&
      JSON.stringify(currentOperationalContext) ===
        JSON.stringify(completionOperationalContext)
    )
      return;
    toast.error(
      "El contexto del pago cambió. Actualiza la bandeja y vuelve a abrir este trabajo.",
    );
    setIsCompletionModalOpen(false);
    setCompletionRequest(null);
    setCompletionSnapshot(null);
    setCompletionOperationalContext(null);
    void leaseSet
      .release(completionRequest.id)
      .catch(() => undefined)
      .finally(() => leaseSet.clearLocal());
    void activeQueue.refetch({ force: true });
  }, [
    completionRequest,
    completionSnapshot,
    completionOperationalContext,
    displayedRequests,
    isCompletionModalOpen,
    sessionExpiresAt,
    user?.id,
  ]);

  useEffect(() => {
    if (!hasInvalidUrl && rawQuery !== canonicalQuery) {
      replacePaymentUrl(new URLSearchParams(canonicalQuery));
    }
  }, [canonicalQuery, hasInvalidUrl, rawQuery]);
  const bulkRunScope: BulkMarkPaidRunScope | null =
    canManagePayments && user?.id
      ? {
          userId: user.id,
          sessionId: sessionExpiresAt ?? `${user.id}:${roleCode ?? "sin-rol"}`,
          pageIdentity: viewIdentity || "payments-default",
        }
      : null;
  const resultIdentity = displayedRequests
    .map(
      (request) =>
        `${request.id}:${request.giof_work?.assignmentVersion ?? "missing"}`,
    )
    .join("|");
  const assignmentItems: GiofBulkSelectableWorkItem[] =
    displayedRequests.flatMap((request) => {
      const work = request.giof_work;
      return work
        ? [
            {
              requestId: request.id,
              label: request.request_code ?? "Pago",
              work,
            },
          ]
        : [];
    });
  const selectedAssignmentItems = bulkAssignmentMode
    ? getGiofCurrentPageSelection(
        assignmentItems,
        selectedAssignmentIds,
        bulkAssignmentMode,
      )
    : [];
  const hasVisiblePendingDriveProjection = displayedRequests.some(
    (request) =>
      request.payment?.drive_projection_status === "PENDING" ||
      request.payment?.drive_projection_status === "PROCESSING",
  );

  useDriveProjectionPolling({
    hasPendingProjection: hasVisiblePendingDriveProjection,
    refetch: () => activeQueue.refetch({ force: true }),
  });

  useEffect(() => {
    setSelectedAssignmentIds([]);
    setSelectedPaymentIds([]);
  }, [bulkAssignmentMode, resultIdentity, viewIdentity]);

  useEffect(() => {
    if (!bulkRunScope) return;
    const recovered = loadBulkMarkPaidRun(bulkRunScope);
    if (!recovered) return;
    setBulkRequests(
      recovered.commands
        .map((command) =>
          displayedRequests.find((request) => request.id === command.requestId),
        )
        .filter((request): request is PaymentQueueRequest => Boolean(request)),
    );
    setBulkOpen(true);
  }, [
    bulkRunScope?.pageIdentity,
    bulkRunScope?.sessionId,
    bulkRunScope?.userId,
  ]);

  async function openRegisterPayment(request: PaymentRequest) {
    const work = request.giof_work;
    if (
      !work ||
      work.pool !== GIOF_WORK_POOL.PAYMENT ||
      !canOperateAssignedGiofWork(work, user?.id)
    ) {
      toast.error(
        "Este pago no tiene una asignación operativa vigente para tu usuario. Actualiza la cola.",
      );
      return;
    }
    let context = paymentOperationalContext;
    if (
      !isGiofLeaseCurrent(context, {
        requestId: request.id,
        pool: GIOF_WORK_POOL.PAYMENT,
        assignmentVersion: work.assignmentVersion,
        ownerId: user?.id,
      })
    ) {
      try {
        context = await leaseSet.acquire(request.id, work, [
          request.payment?.id ?? "",
        ]);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Actualiza la cola antes de continuar.",
        );
        await activeQueue.refetch();
        return;
      }
    }
    if (
      !isGiofLeaseCurrent(context, {
        requestId: request.id,
        pool: GIOF_WORK_POOL.PAYMENT,
        assignmentVersion: work.assignmentVersion,
        ownerId: user?.id,
      })
    ) {
      toast.error(
        "No se pudo establecer una sesión PAYMENT vigente. Actualiza la cola y vuelve a intentar.",
      );
      await leaseSet.release(request.id);
      await activeQueue.refetch();
      return;
    }
    setPaymentOperationalContext(context);
    setSelectedRequest(request);
    setIsModalOpen(true);
  }

  async function openRejectPayment(request: PaymentRequest): Promise<void> {
    setBankRejectionIntent(false);
    const work = request.giof_work;
    if (
      request.status !== REQUEST_STATUS.APPROVED ||
      !canManagePayments ||
      !work ||
      work.pool !== GIOF_WORK_POOL.PAYMENT ||
      !canOperateAssignedGiofWork(work, user?.id)
    ) {
      toast.error(
        "Este pago no tiene una asignación PAYMENT vigente para tu usuario. Actualiza la cola.",
      );
      await activeQueue.refetch({ force: true });
      return;
    }

    try {
      const lease = await leaseSet.acquire(request.id, work);
      if (
        !isGiofLeaseCurrent(lease, {
          requestId: request.id,
          pool: GIOF_WORK_POOL.PAYMENT,
          assignmentVersion: work.assignmentVersion,
          ownerId: user?.id,
        })
      ) {
        throw new Error(
          "No se pudo establecer una sesión PAYMENT vigente. Actualiza la cola.",
        );
      }
      setRejectionRequest(request);
      setRejectionLease(lease);
      setIsRejectionOpen(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo abrir el rechazo. Actualiza la cola.",
      );
      await leaseSet.release(request.id);
      await activeQueue.refetch({ force: true });
    }
  }

  async function refreshAfterPaymentRejection(
    result: RejectApprovedPaymentResponse,
  ): Promise<void> {
    const requestId = result.id;
    if (requestId) await leaseSet.release(requestId);
    setSelectedPaymentIds((current) =>
      requestId ? current.filter((id) => id !== requestId) : current,
    );
    setBulkRequests((current) =>
      requestId ? current.filter((row) => row.id !== requestId) : current,
    );
    if (bulkRunScope) {
      const persistedRun = loadBulkMarkPaidRun(bulkRunScope, {
        recover: false,
      });
      if (
        persistedRun?.commands.some(
          (command) => command.requestId === requestId,
        )
      ) {
        removeBulkMarkPaidRun(bulkRunScope);
      }
    }
    setRejectionLease(null);
    invalidateRequestDomain(requestId);
    await activeQueue.refetch({ force: true });
  }

  async function refreshAfterPaymentRejectionFailure(): Promise<void> {
    if (rejectionRequest?.id) {
      invalidateRequestDomain(rejectionRequest.id);
    }
    await activeQueue.refetch({ force: true });
  }

  async function acquireBulkLease(
    command: BulkMarkPaidCommand,
  ): Promise<BulkMarkPaidLease> {
    if (!canManagePayments || !user?.id)
      throw new Error("Sin permiso para marcar pagos.");
    const current = displayedRequests.find(
      (request) => request.id === command.requestId,
    );
    if (!current)
      throw new Error(
        "La solicitud ya no está en la página actual. Actualiza la cola.",
      );
    const work = current.giof_work;
    if (!work || !isBulkPaymentSelectable(current, user.id))
      throw new Error("La asignación cambió. Actualiza la cola.");
    const lease = await leaseSet.acquire(current.id, work);
    if (
      !isGiofLeaseCurrent(lease, {
        requestId: current.id,
        pool: GIOF_WORK_POOL.PAYMENT,
        assignmentVersion: work.assignmentVersion,
        ownerId: user.id,
      })
    )
      throw new Error("Sesión PAYMENT no vigente. Actualiza la cola.");
    return {
      requestId: current.id,
      assignmentVersion: Number(lease.assignmentVersion),
      leaseToken: lease.token,
    };
  }

  async function reconcileBulkRun(
    recovered: BulkMarkPaidRunState,
  ): Promise<MarkPaidItemResult[]> {
    const rows = await Promise.all(
      recovered.commands.map((command) =>
        api.get<PaymentRequest>(`/requests/${command.requestId}`),
      ),
    );
    return rows.flatMap((row, index) => {
      if (row.status !== REQUEST_STATUS.PAID) return [];
      const command = recovered.commands[index];
      return [
        {
          request_id: row.id,
          command_id: command.commandId,
          outcome: BULK_PAYMENT_RESULT_STATUS.ALREADY_PROCESSED,
          payment_id: row.payment?.id ?? row.payment_id ?? null,
          code: "RECOVERED_PAID",
          message: "El servidor confirma que el pago ya está registrado.",
          original: {
            amount: getExactPayablePrincipal(row),
            currency: row.currency,
          },
          actual_disbursement: null,
          valuation: row.payment?.valuation ?? row.valuation ?? null,
          missing_fields: [...(row.payment?.missing_fields ?? [])],
          rexan_activation: row.rexan_activation ?? null,
        },
      ];
    });
  }

  async function clearPaymentOperationalContext(
    refresh = false,
  ): Promise<void> {
    const requestId =
      selectedRequest?.id ?? paymentOperationalContext?.requestId;
    setPaymentOperationalContext(null);
    if (requestId) await leaseSet.release(requestId);
    if (refresh) await activeQueue.refetch();
  }

  async function refreshAfterPayment(result: RegisterPaymentResponse) {
    setPaymentOperationalContext(null);
    await leaseSet.release(result.request.id);
    await activeQueue.refetch();
    const notice = getPaymentRegisteredToast(result);
    toast.success(notice.title, { description: notice.description });
  }

  function refreshAfterCompletion(
    acknowledgement: CompletePaymentDetailsResponse,
  ): void {
    const cleanupIdentity = `${acknowledgement.request_id}:${acknowledgement.payment_id}:${acknowledgement.completed_at ?? "pending"}`;
    if (completionCleanupRef.current.has(cleanupIdentity)) return;
    completionCleanupRef.current.add(cleanupIdentity);
    const capturedLease = leaseSet.captureAndFence(acknowledgement.request_id);
    setCompletionSnapshot(null);
    setCompletionOperationalContext(null);
    setCompletionRequest(null);
    setIsCompletionModalOpen(false);
    toast.success("Pago completado.");
    void Promise.allSettled([
      capturedLease
        ? leaseSet.releaseCaptured(capturedLease)
        : Promise.resolve(),
      activeQueue.refetch({ force: true }),
    ]);
  }

  function setTab(nextStatus: PaymentQueueTab) {
    changeFilters({ tab: nextStatus, completeness: undefined });
  }

  async function openCompletePaymentDetails(request: PaymentRequest) {
    const operationalContext = getPaymentCompletionOperationalContext(
      request,
      user?.id,
      sessionExpiresAt,
    );
    if (!operationalContext) {
      toast.error(
        "Este pago no tiene un contexto PAYMENT vigente. Actualiza la cola.",
      );
      return;
    }
    if (request.giof_work) {
      if (!canOperateAssignedGiofWork(request.giof_work, user?.id)) return;
      try {
        const lease = await leaseSet.acquire(request.id, request.giof_work, [
          request.payment?.id ?? request.payment_id ?? "",
        ]);
        if (
          !isGiofLeaseCurrent(lease, {
            requestId: request.id,
            pool: GIOF_WORK_POOL.PAYMENT,
            assignmentVersion: request.giof_work.assignmentVersion,
            ownerId: user?.id,
          })
        ) {
          throw new Error(
            "No se pudo establecer una sesión PAYMENT vigente. Actualiza la cola.",
          );
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Actualiza la cola.",
        );
        return;
      }
    }
    setCompletionRequest(request);
    setCompletionSnapshot(getCanonicalCompletionSnapshot(request));
    setCompletionOperationalContext(operationalContext);
    setIsCompletionModalOpen(true);
  }

  async function prepareCompletionSubmit(): Promise<void> {
    const current = completionRequest;
    const expectedSnapshot = completionSnapshot;
    const expectedOperationalContext = completionOperationalContext;
    if (!current || !expectedSnapshot || !expectedOperationalContext) {
      throw new Error(
        "El contexto del pago ya no está vigente. Vuelve a abrirlo desde la bandeja.",
      );
    }
    try {
      const renewed = await leaseSet.renew(current.id);
      if (
        getCanonicalCompletionSnapshot(current) !== expectedSnapshot ||
        renewed.requestId !== expectedOperationalContext.requestId ||
        renewed.ownerId !== expectedOperationalContext.ownerId ||
        renewed.ownerId !== user?.id ||
        renewed.assignmentVersion !==
          expectedOperationalContext.assignmentVersion ||
        renewed.pool !== expectedOperationalContext.pool ||
        expectedOperationalContext.paymentId !==
          (current.payment?.id ?? current.payment_id) ||
        expectedOperationalContext.userId !== user?.id ||
        expectedOperationalContext.sessionId !== sessionExpiresAt
      ) {
        throw new Error(
          "El contexto del pago cambió. Actualiza la bandeja y vuelve a abrir este trabajo.",
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "El contexto del pago cambió. Actualiza la bandeja y vuelve a abrir este trabajo.";
      toast.error(message);
      await leaseSet.release(current.id).catch(() => undefined);
      leaseSet.clearLocal();
      setIsCompletionModalOpen(false);
      setCompletionRequest(null);
      setCompletionSnapshot(null);
      setCompletionOperationalContext(null);
      await activeQueue.refetch({ force: true }).catch(() => undefined);
      throw error;
    }
  }

  async function retryRexan(request: PaymentRequest) {
    if (!canRetryRexan || isRetryingRexan) return;
    if (request.giof_work) {
      if (!canOperateAssignedGiofWork(request.giof_work, user?.id)) return;
      try {
        await leaseSet.acquire(request.id, request.giof_work);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Actualiza la cola.",
        );
        return;
      }
    }
    await retryRexanActivation(request.id);
    await leaseSet.release(request.id);
    await activeQueue.refetch();
    toast.success("REXAN programada para reintento.");
  }

  function replacePaymentUrl(params: URLSearchParams): void {
    const query = params.toString();
    if (query) router.replace(`/payments?${query}`);
    else router.replace("/payments");
  }

  function changeFilters(patch: Partial<PaymentQueueUrlFilters>): void {
    replacePaymentUrl(
      updatePaymentQueueUrl(new URLSearchParams(viewIdentity), patch),
    );
  }

  function clearFilters(): void {
    replacePaymentUrl(
      serializePaymentQueueUrl({
        tab,
        work_scope: canManagePayments ? GIOF_WORK_SCOPE.ALL : undefined,
      }),
    );
  }

  function toggleAssignment(requestId: string, checked: boolean): void {
    const item = assignmentItems.find(
      (candidate) => candidate.requestId === requestId,
    );
    if (
      !bulkAssignmentMode ||
      !item ||
      !isGiofBulkSelectable(item.work, bulkAssignmentMode)
    )
      return;
    setSelectedAssignmentIds((current) =>
      checked
        ? [...new Set([...current, requestId])].slice(0, 50)
        : current.filter((id) => id !== requestId),
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cola de Pagos</h1>
        <p className="text-muted-foreground">
          Gestiona solicitudes en proceso de pago y consulta el historial
          pagado.
        </p>
        {canManagePayments ? (
          <p className="mt-1 text-sm text-muted-foreground">
            El pago individual registra por separado la fecha efectiva, la fecha
            de destino y el momento de clasificación en SIG-EPE.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resultados</CardTitle>
            <CardDescription>
              Resumen exacto de todos los filtros aplicados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {activeQueue.summary?.count ?? displayedTotal}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {tab === PAYMENT_QUEUE_TAB.REJECTED
                ? "Monto no pagado"
                : "Monto pagable filtrado"}
            </CardTitle>
            <CardDescription>
              Saldo REXAN elegible o monto normal, agregado por moneda en
              servidor
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            {Object.entries(
              activeQueue.summary?.payable_amount_by_currency ?? {},
            ).map(([currency, amount]) => (
              <p key={currency} className="text-2xl font-bold">
                <span className="text-sm font-medium text-muted-foreground">
                  {currency}
                </span>{" "}
                {amount}
              </p>
            ))}
            {Object.keys(activeQueue.summary?.payable_amount_by_currency ?? {})
              .length === 0 ? (
              <p className="text-2xl font-bold">—</p>
            ) : null}
          </CardContent>
          {activeQueue.summary?.accounting_amount_pen !== undefined ? (
            <CardContent className="text-sm text-muted-foreground">
              Subtotal contable conocido PEN:{" "}
              {activeQueue.summary.accounting_amount_pen}.{" "}
              {activeQueue.summary.totals_complete
                ? "Valoración disponible para todos los resultados."
                : `Valoración incompleta: ${activeQueue.summary.unresolved_count ?? "—"} sin resolver.`}
            </CardContent>
          ) : null}
        </Card>
      </div>

      {hasInvalidUrl ? (
        <QueueFilterReset
          message="No se pudieron aplicar los filtros de la URL. Restablécelos para continuar sin exponer parámetros inválidos."
          onReset={() =>
            replacePaymentUrl(
              serializePaymentQueueUrl({
                work_scope: canManagePayments ? GIOF_WORK_SCOPE.ALL : undefined,
              }),
            )
          }
        />
      ) : (
        <PaymentQueueFilters
          filters={{
            ...urlFilters,
            work_scope: workScope,
            assignee_id: workAssigneeId,
          }}
          isManager={canManageAssignments}
          isOperational={canManagePayments}
          summary={activeQueue.summary}
          total={displayedTotal}
          isLoading={displayedIsLoading}
          isRefreshing={displayedIsRefreshing}
          onChange={changeFilters}
          onClear={clearFilters}
        />
      )}

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>Solicitudes para pago</CardTitle>
              <CardDescription>
                {tab === PAYMENT_QUEUE_TAB.APPROVED
                  ? "Solicitudes en gestión de transferencia."
                  : tab === PAYMENT_QUEUE_TAB.PENDING_DATA
                    ? "Pagos con referencia, constancia o TC final pendiente."
                    : tab === PAYMENT_QUEUE_TAB.REJECTED
                      ? "Pagos rechazados después de la aprobación, sin incluir rechazos de revisión."
                      : "Pagos registrados."}
              </CardDescription>
            </div>
            {isPaymentExportReady() && canExportPayment && !hasInvalidUrl ? (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isExportingPayment}
                  aria-busy={isExportingPayment}
                  onClick={() => void exportPaymentExcel()}
                >
                  {isExportingPayment ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Download className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isExportingPayment ? "Exportando Excel..." : "Exportar Excel"}
                </Button>
                {isExportingPayment ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={paymentExportControllerRef.current?.signal.aborted}
                    onClick={() => paymentExportControllerRef.current?.abort()}
                  >
                    Cancelar descarga
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="min-w-0">
            <div
              className="inline-flex flex-wrap rounded-md border p-1"
              role="group"
              aria-label="Vista de pagos"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTab(PAYMENT_QUEUE_TAB.APPROVED)}
                className={cn(
                  tab === PAYMENT_QUEUE_TAB.APPROVED &&
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
                data-testid="payment-filter-approved"
              >
                Pendientes
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTab(PAYMENT_QUEUE_TAB.PAID)}
                className={cn(
                  tab === PAYMENT_QUEUE_TAB.PAID &&
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
                data-testid="payment-filter-paid"
              >
                Historial pagado
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTab(PAYMENT_QUEUE_TAB.PENDING_DATA)}
                className={cn(
                  tab === PAYMENT_QUEUE_TAB.PENDING_DATA &&
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
                data-testid="payment-filter-pending-data"
              >
                Datos pendientes
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setTab(PAYMENT_QUEUE_TAB.REJECTED)}
                className={cn(
                  tab === PAYMENT_QUEUE_TAB.REJECTED &&
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
                data-testid="payment-filter-rejected"
              >
                Pagos rechazados
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isPaymentExportReady() && canExportPayment && !hasInvalidUrl && (
            <p className="mb-3 text-sm text-muted-foreground">
              El Excel incluye solicitudes aprobadas pendientes de pago, pagos
              rechazados sin pago y pagos registrados que coincidan con los
              filtros aplicados.
            </p>
          )}
          {canManagePayments && tab === PAYMENT_QUEUE_TAB.APPROVED ? (
            <div
              className="mb-3 flex items-center gap-3"
              aria-label="Marcado de pagos independiente de asignación"
            >
              <p className="text-sm">
                {selectedPaymentIds.length}/50 para confirmar transferencia
                realizada
              </p>
              <Button
                disabled={!selectedPaymentIds.length || bulkOpen}
                onClick={() => {
                  setBulkRequests(
                    displayedRequests.filter(
                      (row) =>
                        selectedPaymentIds.includes(row.id) &&
                        isBulkPaymentSelectable(row, user?.id),
                    ),
                  );
                  setBulkOpen(true);
                }}
              >
                Marcar pagos seleccionados
              </Button>
            </div>
          ) : null}
          {bulkAssignmentMode === GIOF_BULK_ASSIGNMENT_MODE.MANAGER_TARGET &&
          selectedAssignmentItems.length > 0 ? (
            <GiofBulkAssignmentBar
              pool={GIOF_WORK_POOL.PAYMENT}
              items={selectedAssignmentItems}
              onClear={() => setSelectedAssignmentIds([])}
              onSuccess={() => activeQueue.refetch()}
            />
          ) : null}
          {displayedIsRefreshing && !displayedError && (
            <p
              className="mb-3 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
              role="status"
            >
              Actualizando cola de pagos...
            </p>
          )}
          {displayedError ? (
            <div className="space-y-3 rounded-md border border-destructive/40 p-4">
              <p className="text-sm text-destructive">
                {getApiErrorMessage(displayedError)}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void activeQueue.refetch()}
              >
                Reintentar
              </Button>
            </div>
          ) : (
            <PaymentQueueTable
              requests={displayedRequests}
              selectedRequestIds={selectedPaymentIds}
              onToggleRequest={
                canManagePayments && tab === PAYMENT_QUEUE_TAB.APPROVED
                  ? (id, checked) =>
                      setSelectedPaymentIds((current) =>
                        checked
                          ? [...new Set([...current, id])].slice(0, 50)
                          : current.filter((value) => value !== id),
                      )
                  : undefined
              }
              onToggleAll={
                canManagePayments && tab === PAYMENT_QUEUE_TAB.APPROVED
                  ? (checked) =>
                      setSelectedPaymentIds(
                        checked
                          ? displayedRequests
                              .filter((row) =>
                                isBulkPaymentSelectable(row, user?.id),
                              )
                              .slice(0, 50)
                              .map((row) => row.id)
                          : [],
                      )
                  : undefined
              }
              isLoading={displayedIsLoading}
              onRegisterPayment={openRegisterPayment}
              onRejectPayment={
                canManagePayments && tab === PAYMENT_QUEUE_TAB.APPROVED
                  ? openRejectPayment
                  : undefined
              }
              onRejectBankPayment={(request) => {
                if (!user?.id || !canRejectBankPayment(request, roleCode)) return;
                setBankRejectionIntent(true);
                setRejectionRequest(request);
                setRejectionLease(null);
                setIsRejectionOpen(true);
              }}
              onCompletePaymentDetails={openCompletePaymentDetails}
              onRetryRexanActivation={canRetryRexan ? retryRexan : undefined}
              currentUserId={user?.id}
              roleCode={roleCode}
              refetchPoolQueue={(options) => activeQueue.refetch(options)}
              isGiofManager={
                isGiofManager && tab !== PAYMENT_QUEUE_TAB.REJECTED
              }
              bulkAssignmentMode={bulkAssignmentMode ?? null}
              canManagePayments={
                canManagePayments && tab !== PAYMENT_QUEUE_TAB.REJECTED
              }
              paymentLeases={leaseSet.leases}
              selectedAssignmentIds={selectedAssignmentIds}
              onToggleAssignment={
                bulkAssignmentMode ? toggleAssignment : undefined
              }
              onToggleAllAssignments={(checked) =>
                setSelectedAssignmentIds(
                  checked
                    ? displayedRequests
                        .filter(
                          (request) =>
                            request.giof_work &&
                            bulkAssignmentMode &&
                            isGiofBulkSelectable(
                              request.giof_work,
                              bulkAssignmentMode,
                            ),
                        )
                        .map((request) => request.id)
                        .slice(0, 50)
                    : [],
                )
              }
            />
          )}
          {totalPages > 1 ? (
            <div
              className="mt-4 flex items-center justify-between"
              aria-label="Paginación de pagos"
            >
              <p className="text-sm text-muted-foreground">
                Página {page} de {totalPages}. Total: {displayedTotal}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page <= 1 || displayedIsLoading || bulkOpen}
                  onClick={() => {
                    if (!bulkOpen)
                      changeFilters({ page: Math.max(1, page - 1) });
                  }}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    page >= totalPages || displayedIsLoading || bulkOpen
                  }
                  onClick={() =>
                    changeFilters({ page: Math.min(totalPages, page + 1) })
                  }
                >
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <RegisterPaymentModal
        request={selectedRequest}
        operationalContext={paymentOperationalContext}
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            void clearPaymentOperationalContext();
            setSelectedRequest(null);
          }
        }}
        onOperationalContextInvalid={() => clearPaymentOperationalContext(true)}
        onSuccess={refreshAfterPayment}
      />
      <BulkMarkPaidModal
        requests={bulkRequests}
        open={bulkOpen}
        scope={bulkRunScope}
        pageRequestIds={displayedRequests.map((request) => request.id)}
        acquireLease={acquireBulkLease}
        releaseLease={(requestId) => leaseSet.release(requestId)}
        refetchQueue={(options) => activeQueue.refetch(options)}
        reconcileRun={reconcileBulkRun}
        onOpenChange={(open) => {
          setBulkOpen(open);
          if (!open) {
            void Promise.all(
              bulkRequests.map((row) => leaseSet.release(row.id)),
            );
            setSelectedPaymentIds([]);
          }
        }}
        onSuccess={async () => {
          setSelectedPaymentIds([]);
          await activeQueue.refetch({ force: true });
        }}
      />
      <CompletePaymentDetailsModal
        request={completionRequest}
        open={isCompletionModalOpen}
        onOpenChange={(open) => {
          setIsCompletionModalOpen(open);
          if (!open && completionRequest) {
            setCompletionSnapshot(null);
            setCompletionOperationalContext(null);
            void leaseSet.release(completionRequest.id);
          }
        }}
        beforeSubmit={prepareCompletionSubmit}
        onSuccess={refreshAfterCompletion}
      />
      <RejectApprovedPaymentModal
        bankIntent={bankRejectionIntent}
        onBankSuccess={async (result) => {
          invalidateRequestDomain(result.request_id);
          await activeQueue.refetch({ force: true });
        }}
        request={bankRejectionIntent ? currentBankRequest : rejectionRequest}
        lease={rejectionLease}
        open={isRejectionOpen}
        onOpenChange={(open) => {
          setIsRejectionOpen(open);
          if (!open) {
            const requestId = rejectionRequest?.id;
            setRejectionRequest(null);
            setRejectionLease(null);
            if (requestId && !bankRejectionIntent) void leaseSet.release(requestId);
          }
        }}
        onFailureRefresh={refreshAfterPaymentRejectionFailure}
        onSuccess={refreshAfterPaymentRejection}
      />
    </div>
  );
}
