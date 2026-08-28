"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApproveRequest, useObserveRequest, useRejectRequest, useRequest, useRequestDocuments, useRequestRenditionReport, useRetryRexanActivation, useSettlementContext, useStartAdvanceSettlement } from "@/hooks/use-requests";
import { useGiofWorkLease } from "@/hooks/use-giof-work";
import { useDriveProjectionPolling } from "@/hooks/use-drive-projection-polling";
import { GiofWorkStatus } from "@/components/giof-work/giof-work-controls";
import { canEditAssignedGiofWork, canOperateAssignedGiofWork, canRetryGiofWork, isGiofManagerRole, isGiofOperationalRole } from "@/lib/role-capabilities";
import { ROUTES } from "@/lib/constants";
import {
  canCorrectObservedRequest,
  canEditDraftRequest,
  canReviewRequest,
  deriveRexanApprovalPreview,
  deriveRexanPreviewOutcome,
  formatRequestCurrency,
  formatRequestDate,
  getAdvanceSettlementCta,
  getApiErrorMessage,
  getPaymentRequestCreatorDisplayName,
  getPaymentProofDisplayItems,
  getPaymentRexanStatusLabel,
  getRegisteredPartyDisplay,
  getRegisteredPartyDocumentLabel,
  getPaymentRequestRenditionStatus,
  getRequestDocumentDisplayName,
  getRequestDisplayCode,
  getRenditionNextStepGuidance,
  getPlanningLineDisplay,
  getRenditionStatusLabel,
  getReturnProofDocuments,
  getRexanOutcomeBadgeTone,
  getRexanOutcomeDescription,
  getRexanOutcomeLabel,
  getRequestMonthLabel,
  getRequestObserverName,
  normalizeMoneyAmount,
  REQUEST_TYPE_LABELS,
  type PaymentProofDisplayItem,
  validateRexanReturnProofSelection,
} from "@/lib/requests";
import { getSafeDocumentUrl } from "@/lib/safe-url";
import { useAuthStore } from "@/stores/auth-store";
import { RENDITION_NEXT_STEP_ACTION, REQUEST_DOCUMENT_CATEGORY, REQUEST_DOCUMENT_SCOPE_TYPE, REQUEST_DOCUMENT_UPLOAD_STATUS, REQUEST_RENDITION_REPORT_STATUS, REQUEST_TYPE, REXAN_OUTCOME, type ApproveRequestDto, type RequestDocument, type RequestRenditionAllocationCoverage, type RequestRenditionReport, type RexanOutcome } from "@/types/requests";
import { RequestStatusStepper } from "./request-status-stepper";
import { RequestDocumentsCard } from "./request-documents-card";
import { StructuredRenditionReportCard } from "./structured-rendition-report-card";
import { StatusBadge } from "./status-badge";
import { DriveProjectionState } from "./drive-projection-state";
import { REQUEST_STATUS_SURFACE } from "@/lib/request-status-vocabulary";

function getStructuredReportTotal(report: RequestRenditionReport | null): number | null {
  return normalizeMoneyAmount(report?.totals.total_amount ?? report?.total_amount);
}

function isStructuredGeneratedReportReady(report: RequestRenditionReport | null): boolean {
  return Boolean(
    report?.status === REQUEST_RENDITION_REPORT_STATUS.EXPORTED
    && report.settlement_report_document_id
    && getStructuredReportTotal(report) !== null,
  );
}

function getComputedOutcomeLabel(outcome: RexanOutcome | null): string {
  if (outcome === REXAN_OUTCOME.EXACT) return "Exacta";
  if (outcome === REXAN_OUTCOME.DEVOLUCION) return "Devolución pendiente";
  if (outcome === REXAN_OUTCOME.EXCESS) return "Saldo adicional por pagar";
  return "Pendiente";
}

function getComputedOutcomeDifferenceLabel(outcome: RexanOutcome | null): string {
  if (outcome === REXAN_OUTCOME.DEVOLUCION) return "Diferencia a devolver";
  if (outcome === REXAN_OUTCOME.EXCESS) return "Diferencia por pagar";
  return "Diferencia";
}

interface StructuredReturnChecklistRow {
  allocationId: string;
  label: string;
  expectedAmount: number;
  registeredAmount: number | null;
  proof: RequestDocument | null;
  proofName: string | null;
  isComplete: boolean;
}

function toMoneyCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return Math.round(numericValue * 100);
}

function getStructuredReturnExpectedAmount(coverage: RequestRenditionAllocationCoverage): number {
  const explicitExpected = normalizeMoneyAmount(coverage.expected_return_amount);
  if (explicitExpected !== null) return Math.max(explicitExpected, 0);
  const paidBaseAmount = normalizeMoneyAmount(coverage.paid_base_amount);
  const renderedAmount = normalizeMoneyAmount(coverage.rendered_amount ?? coverage.row_total_amount);
  if (paidBaseAmount === null || renderedAmount === null) return 0;
  return Math.max(paidBaseAmount - renderedAmount, 0);
}

function getStructuredReturnLineLabel(coverage: RequestRenditionAllocationCoverage): string {
  const code = coverage.line_code?.trim();
  const name = coverage.request_allocation_label?.trim() || coverage.line_name?.trim() || coverage.resource_description?.trim();
  if (code && name) return `${code} - ${name}`;
  return code || name || `Línea POA ${coverage.request_allocation_id}`;
}

function isValidStructuredReturnProof(document: RequestDocument | undefined, allocationId: string): document is RequestDocument {
  return Boolean(
    document
    && document.document_category === REQUEST_DOCUMENT_CATEGORY.RETURN_PROOF
    && document.upload_status !== REQUEST_DOCUMENT_UPLOAD_STATUS.FAILED
    && document.scope_type === REQUEST_DOCUMENT_SCOPE_TYPE.ALLOCATION
    && document.request_allocation_id === allocationId,
  );
}

function getStructuredReturnChecklistRows(report: RequestRenditionReport | null, documents: RequestDocument[]): StructuredReturnChecklistRow[] {
  if (!report) return [];
  return report.allocation_coverage
    .map((coverage) => {
      const expectedAmount = getStructuredReturnExpectedAmount(coverage);
      const lineReturn = coverage.line_return ?? null;
      if (toMoneyCents(expectedAmount) === 0 && !lineReturn) return null;
      const proof = lineReturn?.return_proof_document_id
        ? documents.find((document) => document.id === lineReturn.return_proof_document_id)
        : undefined;
      const expectedCents = toMoneyCents(expectedAmount) ?? 0;
      const returnedCents = toMoneyCents(lineReturn?.returned_amount);
      const validProof = isValidStructuredReturnProof(proof, coverage.request_allocation_id) ? proof : null;
      const isComplete = expectedCents === 0 || Boolean(
        lineReturn
        && returnedCents === expectedCents
        && lineReturn.justification.trim()
        && validProof,
      );
      return {
        allocationId: coverage.request_allocation_id,
        label: getStructuredReturnLineLabel(coverage),
        expectedAmount,
        registeredAmount: lineReturn ? normalizeMoneyAmount(lineReturn.returned_amount) : null,
        proof: validProof,
        proofName: validProof ? getRequestDocumentDisplayName(validProof) : lineReturn?.return_proof_filename || null,
        isComplete,
      };
    })
    .filter((row): row is StructuredReturnChecklistRow => row !== null);
}

function PaymentProofRows({ items, currency }: { items: PaymentProofDisplayItem[]; currency: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay constancias de pago registradas.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">{item.label}</p>
            <p className="text-sm text-muted-foreground">{item.filename}</p>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {item.paidAt && <span>Pagado: {formatRequestDate(item.paidAt)}</span>}
              {item.amountPaid !== null && <span>Monto: {formatRequestCurrency(item.amountPaid, currency)}</span>}
              {item.operationReference && <span>Operación: {item.operationReference}</span>}
            </div>
          </div>
          {item.url ? (
            <Button variant="outline" size="sm" asChild>
              <a href={item.url} target="_blank" rel="noopener noreferrer">Ver constancia</a>
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">Enlace no disponible</span>
          )}
        </div>
      ))}
    </div>
  );
}

function PaymentProofCard({ items, currency }: { items: PaymentProofDisplayItem[]; currency: string }) {
  return (
    <Card data-testid="request-payment-proof-card">
      <CardHeader><CardTitle>Pago y constancia</CardTitle></CardHeader>
      <CardContent>
        <PaymentProofRows items={items} currency={currency} />
      </CardContent>
    </Card>
  );
}

export function RequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { request, isInitialLoading, isRefreshing, error, refetch, patchRequest } = useRequest(params.id);
  const hasPendingDriveProjection =
    request?.payment?.drive_projection_status === "PENDING"
    || request?.payment?.drive_projection_status === "PROCESSING";

  useDriveProjectionPolling({
    hasPendingProjection: hasPendingDriveProjection,
    refetch: () => refetch({ background: true }),
  });
  const requestDocuments = useRequestDocuments(params.id);
  const settlementContextState = useSettlementContext(params.id, request?.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT);
  const structuredReportState = useRequestRenditionReport(params.id, request?.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT);
  const user = useAuthStore((state) => state.user);
  const roleCode = user?.role?.code;
  const isGiofOperational = isGiofOperationalRole(roleCode);
  const isGiofManager = isGiofManagerRole(roleCode);
  const leaseSession = useGiofWorkLease();
  const shouldProcess = searchParams.get("mode") === "process";
  const [observeOpen, setObserveOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [observeComment, setObserveComment] = useState("");
  const [fieldReference, setFieldReference] = useState("");
  const [approveComment, setApproveComment] = useState("");
  const [validatedSpentAmount, setValidatedSpentAmount] = useState("");
  const [returnProofDocumentId, setReturnProofDocumentId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const { observeRequest, isLoading: observing } = useObserveRequest();
  const { approveRequest, isLoading: approving } = useApproveRequest();
  const { rejectRequest, isLoading: rejecting } = useRejectRequest();
  const { startAdvanceSettlement, isLoading: startingSettlement } = useStartAdvanceSettlement();
  const { retryRexanActivation, isLoading: retryingRexan } = useRetryRexanActivation();

  useEffect(() => {
    const giofWork = request?.giof_work;
    if (!request || !giofWork || !shouldProcess || !canOperateAssignedGiofWork(giofWork, user?.id) || leaseSession.lease || leaseSession.isLoading) return;
    void leaseSession.acquire(request.id, giofWork, [request.payment?.id ?? request.payment_id ?? ""])
      .then(() => refetch({ background: true }))
      .catch((reason: unknown) => toast.error(reason instanceof Error ? reason.message : "Actualiza la solicitud antes de continuar."));
  }, [request?.id, request?.giof_work?.assignmentVersion, request?.giof_work?.canAcquire, request?.giof_work?.assigneeId, user?.id, shouldProcess, leaseSession.lease?.token, leaseSession.isLoading]);

  const RETURN_PROOF_OBSERVATION_FIELD = "Constancia de devolución";

  if (!request && isInitialLoading) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">Cargando solicitud...</p>;
  }

  if (error || !request) {
    return (
      <div className="space-y-4 rounded-md border border-destructive/40 p-6">
        <p className="text-sm text-destructive">{error?.message ?? "No se encontró la solicitud."}</p>
        <Button variant="outline" onClick={() => void refetch()}>Reintentar</Button>
      </div>
    );
  }

  const openObservations = (request.observations ?? []).filter((observation) => !observation.is_resolved);
  const allObservations = request.observations ?? [];
  const canReview = canReviewRequest(roleCode, request.status)
    && (!isGiofOperational || canEditAssignedGiofWork(request.giof_work, user?.id));
  const isRequestOwner = Boolean(user?.id && request.requester_id === user.id);
  const canCorrect = isRequestOwner && canCorrectObservedRequest(roleCode, request.status);
  const canEditDraft = isRequestOwner && canEditDraftRequest(roleCode, request.status);
  const advanceSettlementCta = getAdvanceSettlementCta(roleCode, request, user?.id);
  const renditionNextStepGuidance = getRenditionNextStepGuidance(roleCode, request, user?.id);
  const canRetryRexan = canRetryGiofWork(roleCode) && canEditAssignedGiofWork(request.giof_work, user?.id);
  const driveFolderUrl = getSafeDocumentUrl(request.drive_folder_url);
  const ownPaymentProofItems = getPaymentProofDisplayItems(request.payment);
  const createdByDisplayName = getPaymentRequestCreatorDisplayName(request);
  const registeredPartyDisplay = getRegisteredPartyDisplay(request);
  const registeredPartyDocument = getRegisteredPartyDocumentLabel(request);
  const renditionStatus = getPaymentRequestRenditionStatus(request);
  const editHref = `${ROUTES.REQUESTS}/${request.id}/edit`;
  const isAdvanceSettlement = request.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT;
  const structuredReport = structuredReportState.report;
  const structuredReportTotal = getStructuredReportTotal(structuredReport);
  const hasStructuredGeneratedReport = isAdvanceSettlement && isStructuredGeneratedReportReady(structuredReport);
  const returnProofDocuments = getReturnProofDocuments(requestDocuments.documents);
  const parsedValidatedSpentAmount = validatedSpentAmount.trim() === "" ? null : Number(validatedSpentAmount);
  const effectiveSpentAmount = hasStructuredGeneratedReport ? structuredReportTotal : parsedValidatedSpentAmount;
  const rexanPreviewOutcome = isAdvanceSettlement && effectiveSpentAmount !== null && Number.isFinite(effectiveSpentAmount)
    ? deriveRexanPreviewOutcome(request.requested_amount, effectiveSpentAmount)
    : null;
  const rexanApprovalPreview = isAdvanceSettlement && effectiveSpentAmount !== null && Number.isFinite(effectiveSpentAmount)
    ? deriveRexanApprovalPreview(request.requested_amount, effectiveSpentAmount, request.currency)
    : null;
  const isStructuredGeneratedDevolucion = hasStructuredGeneratedReport && rexanPreviewOutcome === REXAN_OUTCOME.DEVOLUCION;
  const structuredReturnRows = isStructuredGeneratedDevolucion ? getStructuredReturnChecklistRows(structuredReport, requestDocuments.documents) : [];
  const incompleteStructuredReturnRows = structuredReturnRows.filter((row) => !row.isComplete);
  const storedRexanOutcome = request.rexan_outcome ?? null;
  const originalAdvanceContext = settlementContextState.context?.original_advance ?? null;
  const originalAdvanceProofDocument = settlementContextState.context?.payment?.proof_document ?? null;
  const originalAdvanceProofUrl = getSafeDocumentUrl(originalAdvanceProofDocument?.drive_web_url);
  const shouldShowRexanSummary = isAdvanceSettlement && (
    storedRexanOutcome !== null
    || request.rexan_spent_amount != null
    || request.rexan_balance_amount != null
    || request.rexan_return_proof_document_id != null
  );
  const isRexanReturnProofMissing = rexanPreviewOutcome === REXAN_OUTCOME.DEVOLUCION && !isStructuredGeneratedDevolucion && returnProofDocuments.length === 0;
  const isStructuredReturnIncomplete = isStructuredGeneratedDevolucion && (structuredReturnRows.length === 0 || incompleteStructuredReturnRows.length > 0);
  const returnProofObservationComment = rexanApprovalPreview
    ? `Por favor registra la devolución por ${formatRequestCurrency(rexanApprovalPreview.balanceAmount, request.currency)} desde Saldos por línea POA → Registrar devolución, adjunta o selecciona la constancia de esa línea, guarda el cambio y regenera el informe actualizado antes de reenviar la rendición.`
    : "Por favor registra la devolución desde Saldos por línea POA → Registrar devolución, adjunta o selecciona la constancia de esa línea, guarda el cambio y regenera el informe actualizado antes de reenviar la rendición.";
  const reviewCopy = {
    observeAction: isAdvanceSettlement ? "Observar rendición" : "Observar",
    approveAction: isAdvanceSettlement ? "Aprobar rendición" : "Aprobar",
    rejectAction: isAdvanceSettlement ? "Rechazar rendición" : "Rechazar",
    observeTitle: isAdvanceSettlement ? "Observar rendición" : "Observar solicitud",
    approveTitle: isAdvanceSettlement ? "Aprobar rendición" : "Aprobar solicitud",
    rejectTitle: isAdvanceSettlement ? "Rechazar rendición" : "Rechazar solicitud",
    observeDescription: isAdvanceSettlement
      ? "Indica qué debe corregir el solicitante antes de reenviar la rendición."
      : "Indica qué debe corregir el solicitante antes de reenviar la solicitud.",
    approveDescription: isAdvanceSettlement
      ? "Confirma que la rendición fue revisada y puede cerrar la revisión del anticipo."
      : "Confirma que la solicitud fue revisada y puede continuar el proceso.",
    rejectDescription: isAdvanceSettlement
      ? "El rechazo devuelve el anticipo original a la etapa de rendición. Ingresa un motivo claro."
      : "El rechazo cierra la revisión de esta solicitud. Ingresa un motivo claro.",
    observeSubmit: isAdvanceSettlement ? "Registrar observación de rendición" : "Registrar observación",
    approveSubmit: isAdvanceSettlement ? "Aprobar rendición" : "Aprobar solicitud",
    rejectSubmit: isAdvanceSettlement ? "Rechazar rendición" : "Rechazar solicitud",
  };

  function openApproveDialog(): void {
    if (!request) return;
    setApproveComment("");
    setValidatedSpentAmount(request.rexan_spent_amount === null || request.rexan_spent_amount === undefined ? "" : String(request.rexan_spent_amount));
    setReturnProofDocumentId(request.rexan_return_proof_document_id ?? returnProofDocuments[0]?.id ?? "");
    setApproveOpen(true);
  }

  async function handleObserve(): Promise<void> {
    if (!request) return;
    const comment = observeComment.trim();
    if (!comment) {
      toast.error("Ingresa un comentario para observar la solicitud.");
      return;
    }
    try {
      const observed = await observeRequest(request.id, {
        comment,
        field_reference: fieldReference.trim() || undefined,
      });
      patchRequest(observed);
      await leaseSession.release();
      toast.success("Solicitud observada correctamente");
      setObserveOpen(false);
      setObserveComment("");
      setFieldReference("");
      await refetch({ background: true });
    } catch (reviewError) {
      toast.error(getApiErrorMessage(reviewError));
    }
  }

  function handleRequestReturnProof(): void {
    setFieldReference(RETURN_PROOF_OBSERVATION_FIELD);
    setObserveComment(returnProofObservationComment);
    setApproveOpen(false);
    setObserveOpen(true);
  }

  async function handleApprove(): Promise<void> {
    if (!request) return;
    const payload: ApproveRequestDto = { comment: approveComment.trim() || undefined };
    if (isAdvanceSettlement) {
      if (hasStructuredGeneratedReport && (effectiveSpentAmount === null || !Number.isFinite(effectiveSpentAmount))) {
        toast.error("El informe generado todavía no tiene un total disponible.");
        return;
      }
      if (!hasStructuredGeneratedReport && (parsedValidatedSpentAmount === null || !Number.isFinite(parsedValidatedSpentAmount) || parsedValidatedSpentAmount < 0)) {
        toast.error("Ingresa el gasto validado de la rendición.");
        return;
      }
      if (!isStructuredGeneratedDevolucion) {
        const returnProofError = validateRexanReturnProofSelection(rexanPreviewOutcome, returnProofDocumentId, requestDocuments.documents);
        if (returnProofError) {
          toast.error(returnProofError);
          return;
        }
      }
      if (!hasStructuredGeneratedReport) {
        payload.validated_spent_amount = parsedValidatedSpentAmount ?? undefined;
      }
      if (rexanPreviewOutcome === REXAN_OUTCOME.DEVOLUCION && !isStructuredGeneratedDevolucion) {
        payload.return_proof_document_id = returnProofDocumentId;
      }
    }
    try {
      const approved = await approveRequest(request.id, payload);
      patchRequest(approved);
      await leaseSession.release();
      toast.success(isAdvanceSettlement && rexanPreviewOutcome !== REXAN_OUTCOME.EXCESS ? "Rendición aprobada correctamente" : "Solicitud enviada a gestión de pago");
      setApproveOpen(false);
      setApproveComment("");
      setValidatedSpentAmount("");
      setReturnProofDocumentId("");
      await refetch({ background: true });
      await requestDocuments.refetch({ background: true });
    } catch (reviewError) {
      toast.error(getApiErrorMessage(reviewError));
    }
  }

  async function handleReject(): Promise<void> {
    if (!request) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error("Ingresa el motivo del rechazo.");
      return;
    }
    try {
      const rejected = await rejectRequest(request.id, { reason });
      patchRequest(rejected);
      await leaseSession.release();
      toast.success("Solicitud rechazada correctamente");
      setRejectOpen(false);
      setRejectReason("");
      await refetch({ background: true });
    } catch (reviewError) {
      toast.error(getApiErrorMessage(reviewError));
    }
  }

  async function handleStartSettlement(): Promise<void> {
    if (!request) return;
    try {
      const settlement = await startAdvanceSettlement(request.id);
      toast.success("Rendición iniciada correctamente");
      router.push(`${ROUTES.REQUESTS}/${settlement.id}/edit?step=documents` as Parameters<typeof router.push>[0]);
    } catch (settlementError) {
      toast.error(getApiErrorMessage(settlementError));
      await refetch({ background: true });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{request.request_code ?? request.sequential_number ?? "Solicitud"}</h1>
          <p className="text-muted-foreground">Detalle y estado de la solicitud.</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={request.status} context={request} surface={REQUEST_STATUS_SURFACE.DETAIL} />
          <GiofWorkStatus requestId={request.id} work={request.giof_work} currentUserId={user?.id} isManager={isGiofManager} />
          {driveFolderUrl && (
            <Button variant="outline" asChild>
              <a href={driveFolderUrl} target="_blank" rel="noopener noreferrer" data-testid="request-detail-drive-folder-link">
                Abrir carpeta Drive
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push(ROUTES.REQUESTS)}>Volver</Button>
        </div>
      </div>

      {isRefreshing && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">
          Actualizando solicitud en segundo plano…
        </p>
      )}

      {leaseSession.error && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive" role="alert">{leaseSession.error.message} Actualiza esta vista.</p>}
      {isGiofOperational && request.giof_work?.canEdit !== true && !leaseSession.isLoading && <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Vista de solo lectura. Para procesar un trabajo asignado a ti, ingresa desde la acción “Procesar” de tu bandeja.</p>}

      {canEditDraft && (
        <Card>
          <CardHeader><CardTitle>Borrador editable</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Esta solicitud todavía no fue enviada. Ingresa a editar el borrador para adjuntar documentos, revisar la información y enviarla.</p>
            <Button onClick={() => router.push(editHref as Parameters<typeof router.push>[0])}>Continuar edición</Button>
          </CardContent>
        </Card>
      )}

      {openObservations.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/20">
          <AlertDescription className="space-y-3 text-amber-950 dark:text-amber-100">
            <div>
              <p className="font-medium">Solicitud observada</p>
              <p>Revisa los comentarios del revisor y corrige la información solicitada.</p>
            </div>
            <ul className="list-disc space-y-1 pl-5">
              {openObservations.map((observation) => (
                <li key={observation.id}>{observation.comment}</li>
              ))}
            </ul>
            {canCorrect && (
              <Button onClick={() => router.push(editHref as Parameters<typeof router.push>[0])}>
                Corregir solicitud
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {canReview && (
        <Card>
          <CardHeader><CardTitle>Acciones de revisión</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" onClick={() => setObserveOpen(true)}>{reviewCopy.observeAction}</Button>
            <Button onClick={openApproveDialog}>{reviewCopy.approveAction}</Button>
            <Button variant="destructive" onClick={() => setRejectOpen(true)}>{reviewCopy.rejectAction}</Button>
          </CardContent>
        </Card>
      )}

      {renditionNextStepGuidance && (
        <Card>
          <CardHeader><CardTitle>{renditionNextStepGuidance.title}</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Estado de rendición</p>
                <p className="font-medium">{renditionStatus ? getRenditionStatusLabel(renditionStatus) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fecha límite de rendición</p>
                <p className="font-medium">{formatRequestDate(request.scheduled_rendition_at)}</p>
              </div>
              <p className="text-muted-foreground sm:col-span-2">{renditionNextStepGuidance.description}</p>
            </div>
            {renditionNextStepGuidance.action === RENDITION_NEXT_STEP_ACTION.NAVIGATE && renditionNextStepGuidance.href ? (
              <Button
                variant={advanceSettlementCta?.canStartNew === false ? "outline" : "default"}
                onClick={() => router.push(renditionNextStepGuidance.href as Parameters<typeof router.push>[0])}
              >
                {renditionNextStepGuidance.actionLabel}
              </Button>
            ) : (
              <Button onClick={() => void handleStartSettlement()} disabled={startingSettlement}>
                {startingSettlement ? "Iniciando..." : renditionNextStepGuidance.actionLabel}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {request.rexan_activation && (
        <Card data-testid="rexan-activation-state-card">
          <CardHeader><CardTitle>Activación REXAN</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-xs text-muted-foreground">Estado</p><Badge variant={request.rexan_activation.status === "FAILED" ? "destructive" : "secondary"}>{getPaymentRexanStatusLabel(request.rexan_activation.status, false)}</Badge></div>
            <div><p className="text-xs text-muted-foreground">Intentos</p><p className="font-medium">{request.rexan_activation.attempt_count ?? 0}</p></div>
            <div><p className="text-xs text-muted-foreground">Próximo intento</p><p className="font-medium">{formatRequestDate(request.rexan_activation.next_attempt_at)}</p></div>
            <div>
              <p className="text-xs text-muted-foreground">Rendición</p>
              {request.rexan_activation.settlement_request_id ? (
                <Button size="sm" variant="outline" asChild><a href={`${ROUTES.REQUESTS}/${request.rexan_activation.settlement_request_id}`}>Abrir REXAN</a></Button>
              ) : <p className="font-medium text-muted-foreground">Aún no disponible</p>}
              {request.rexan_activation.status === "FAILED" && canRetryRexan && (
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  disabled={retryingRexan}
                  data-testid="retry-rexan-button"
                  onClick={async () => {
                    try {
                      await retryRexanActivation(request.id);
                      await refetch({ background: true });
                      toast.success("Activación REXAN reprogramada.");
                    } catch (retryError) {
                      toast.error(getApiErrorMessage(retryError));
                    }
                  }}
                >{retryingRexan ? "Reintentando..." : "Reintentar REXAN"}</Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {request.payment?.drive_projection_status && (
        <Card data-testid="drive-payment-projection-state-card">
          <CardHeader><CardTitle>Archivo contable en Drive</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Estado</p>
              <DriveProjectionState payment={request.payment} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Intentos</p>
              <p className="font-medium">
                {request.payment.drive_projection_attempt_count ?? 0}/
                {request.payment.drive_projection_max_attempts ?? 5}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Próximo intento</p>
              <p className="font-medium">
                {formatRequestDate(request.payment.drive_projection_next_attempt_at)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Resultado</p>
              <p className="font-medium">
                {request.payment.drive_projection_completed_at
                  ? `Completado ${formatRequestDate(request.payment.drive_projection_completed_at)}`
                  : request.payment.drive_projection_error_message ??
                    request.payment.drive_projection_error_code ??
                    "Pendiente"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <RequestStatusStepper request={request} />

      {(request.relatedRequest || (request.advanceSettlements?.length ?? 0) > 0) && (
        <Card>
          <CardHeader><CardTitle>Solicitudes relacionadas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {request.relatedRequest && (
              <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Anticipo original</p>
                  <p className="text-sm text-muted-foreground">{getRequestDisplayCode(request.relatedRequest)} · {formatRequestCurrency(Number(request.relatedRequest.requested_amount), request.relatedRequest.currency)}</p>
                </div>
                <Button variant="outline" onClick={() => router.push(`${ROUTES.REQUESTS}/${request.relatedRequest?.id}` as Parameters<typeof router.push>[0])}>Ver anticipo</Button>
              </div>
            )}
            {request.advanceSettlements?.map((settlement) => (
              <div key={settlement.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Rendición vinculada</p>
                  <p className="text-sm text-muted-foreground">{getRequestDisplayCode(settlement)} · {formatRequestCurrency(Number(settlement.requested_amount), settlement.currency)}</p>
                </div>
                <Button variant="outline" onClick={() => router.push(`${ROUTES.REQUESTS}/${settlement.id}` as Parameters<typeof router.push>[0])}>Ver rendición</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {ownPaymentProofItems.length > 0 && (
        <PaymentProofCard items={ownPaymentProofItems} currency={request.currency} />
      )}

      {isAdvanceSettlement && originalAdvanceContext && (
        <Card data-testid="original-advance-payment-context">
          <CardHeader><CardTitle>Anticipo original</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2 text-sm">
              <div>
                <p className="font-medium">{originalAdvanceContext.request_code ?? originalAdvanceContext.sequential_number ?? "Solicitud original"}</p>
                <p className="text-muted-foreground">
                  {formatRequestCurrency(normalizeMoneyAmount(originalAdvanceContext.amount_disbursed ?? originalAdvanceContext.requested_amount) ?? 0, originalAdvanceContext.currency)} · {originalAdvanceContext.concept ?? "Anticipo original"}
                </p>
              </div>
              {originalAdvanceProofDocument && (
                <p className="text-muted-foreground">Constancia de pago original: {originalAdvanceProofDocument.original_filename || originalAdvanceProofDocument.safe_filename || "Constancia de pago"}</p>
              )}
              {!originalAdvanceProofDocument && <p className="text-muted-foreground">Constancia original no disponible.</p>}
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <Button variant="outline" onClick={() => router.push(`${ROUTES.REQUESTS}/${originalAdvanceContext.id}` as Parameters<typeof router.push>[0])}>Ver solicitud original</Button>
              {originalAdvanceProofUrl ? (
                <Button variant="outline" asChild>
                  <a href={originalAdvanceProofUrl} target="_blank" rel="noopener noreferrer">Ver constancia original</a>
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">Constancia original no disponible</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {shouldShowRexanSummary && (
        <Card>
          <CardHeader><CardTitle>Resultado de rendición</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Badge variant={getRexanOutcomeBadgeTone(storedRexanOutcome)}>{getRexanOutcomeLabel(storedRexanOutcome)}</Badge>
              <p className="mt-2 text-sm text-muted-foreground">{getRexanOutcomeDescription(storedRexanOutcome)}</p>
            </div>
            <div><p className="text-xs text-muted-foreground">Gasto validado</p><p className="font-medium">{formatRequestCurrency(normalizeMoneyAmount(request.rexan_spent_amount) ?? 0, request.currency)}</p></div>
            <div><p className="text-xs text-muted-foreground">Saldo</p><p className="font-medium">{formatRequestCurrency(normalizeMoneyAmount(request.rexan_balance_amount) ?? 0, request.currency)}</p></div>
            {request.rexan_return_proof_document_id && <div className="md:col-span-2"><p className="text-xs text-muted-foreground">Constancia de devolución</p><p className="font-medium">{returnProofDocuments.find((document) => document.id === request.rexan_return_proof_document_id) ? getRequestDocumentDisplayName(returnProofDocuments.find((document) => document.id === request.rexan_return_proof_document_id)!) : request.rexan_return_proof_document_id}</p></div>}
          </CardContent>
        </Card>
      )}

      {isAdvanceSettlement && <StructuredRenditionReportCard request={request} readOnly reportResource={structuredReportState} documentsResource={requestDocuments} onChanged={() => requestDocuments.refetch({ background: true })} />}

      <RequestDocumentsCard request={request} readOnly documentsResource={requestDocuments} />

      <Card>
        <CardHeader><CardTitle>Datos principales</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Tipo</p><p className="font-medium">{REQUEST_TYPE_LABELS[request.request_type]}</p></div>
          <div><p className="text-xs text-muted-foreground">Monto</p><p className="font-medium">{formatRequestCurrency(Number(request.requested_amount), request.currency)}</p></div>
          <div><p className="text-xs text-muted-foreground">Mes</p><p className="font-medium">{getRequestMonthLabel(request.budget_month)}</p></div>
          <div><p className="text-xs text-muted-foreground">Fecha de creación</p><p className="font-medium">{formatRequestDate(request.created_at)}</p></div>
          <div><p className="text-xs text-muted-foreground">Registrado por</p><p className="font-medium">{createdByDisplayName}</p></div>
          <div className="md:col-span-2"><p className="text-xs text-muted-foreground">Línea POA</p><p className="font-medium">{getPlanningLineDisplay(request.budgetPlanningLine)}</p></div>
          <div className="md:col-span-2"><p className="text-xs text-muted-foreground">Concepto</p><p className="font-medium">{request.concept}</p></div>
        </CardContent>
      </Card>

      {(request.allocations?.length ?? 0) > 0 && (
        <Card>
          <CardHeader><CardTitle>Distribución POA</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {request.allocations?.map((allocation, index) => {
              const line = allocation.planning_line ?? allocation.budgetPlanningLine;
              const financiers = allocation.financiers ?? allocation.funding_sources ?? line?.financiers ?? line?.funding_sources ?? [];
              return (
                <div key={allocation.id ?? `${allocation.budget_planning_line_id}-${index}`} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">Bloque {index + 1}: {getPlanningLineDisplay(line)}</p>
                      <p className="text-xs text-muted-foreground">Unidad: {allocation.org_unit?.name ?? line?.org_unit?.name ?? "—"} · Año fiscal: {allocation.fiscal_year}</p>
                    </div>
                    <p className="font-semibold">{formatRequestCurrency(Number(allocation.amount), request.currency)}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Financiador(es): {financiers.length > 0 ? financiers.map((financier) => financier.name ?? financier.code ?? "—").join(", ") : "Sin financiadores informados"}
                  </p>
                  {allocation.payment_execution && <p className="mt-1 text-xs text-muted-foreground">Ejecutado: {formatRequestCurrency(Number(allocation.payment_execution.amount_executed), request.currency)}</p>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>A nombre de</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">A nombre de</p><p className="font-medium">{registeredPartyDisplay}</p></div>
          <div><p className="text-xs text-muted-foreground">Documento</p><p className="font-medium">{registeredPartyDocument}</p></div>
          <div><p className="text-xs text-muted-foreground">Banco</p><p className="font-medium">{request.bank_name ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Cuenta</p><p className="font-medium">{request.bank_account ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">CCI</p><p className="font-medium">{request.bank_cci ?? "—"}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Observaciones</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {allObservations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin observaciones registradas.</p>
          ) : (
            allObservations.map((observation) => (
              <div key={observation.id} className="rounded-md border p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium">
                    {observation.is_resolved ? "Observación resuelta" : "Observación pendiente"}
                  </p>
                  <span className="text-xs text-muted-foreground">{formatRequestDate(observation.created_at)}</span>
                </div>
                <p className="mt-2 text-sm">{observation.comment}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Campo: {observation.field_reference ?? "General"}</span>
                  <span>Revisor: {getRequestObserverName(observation.observer)}</span>
                  {observation.resolved_at && <span>Resuelta: {formatRequestDate(observation.resolved_at)}</span>}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Historial de estados</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(request.statusHistory ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin historial disponible.</p>
          ) : (
            request.statusHistory?.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge status={item.to_status} context={request} />
                  <span className="text-xs text-muted-foreground">{formatRequestDate(item.created_at)}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.comment ?? item.reason ?? "Cambio de estado"}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={observeOpen} onOpenChange={setObserveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewCopy.observeTitle}</DialogTitle>
            <DialogDescription>{reviewCopy.observeDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="field-reference">Campo relacionado</label>
              <Input id="field-reference" value={fieldReference} onChange={(event) => setFieldReference(event.target.value)} placeholder="Ej. cuenta bancaria, proveedor, concepto" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="observe-comment">Comentario *</label>
              <Textarea id="observe-comment" value={observeComment} onChange={(event) => setObserveComment(event.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setObserveOpen(false)} disabled={observing}>Cancelar</Button>
            <Button type="button" onClick={() => void handleObserve()} disabled={observing}>{observing ? "Registrando..." : reviewCopy.observeSubmit}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewCopy.approveTitle}</DialogTitle>
            <DialogDescription>{reviewCopy.approveDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isAdvanceSettlement && (
              <div className="space-y-4 rounded-md border p-4">
                {hasStructuredGeneratedReport ? (
                  <div className="space-y-3 rounded-md bg-muted p-3 text-sm" aria-live="polite">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resultado calculado</p>
                      <p className="mt-1 text-muted-foreground">Revisa el resultado del informe generado y confirma la aprobación de la rendición.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Total rendido</p>
                        <p className="font-semibold">{formatRequestCurrency(structuredReportTotal ?? 0, request.currency)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Anticipo</p>
                        <p className="font-semibold">{formatRequestCurrency(normalizeMoneyAmount(request.requested_amount) ?? 0, request.currency)}</p>
                        {request.relatedRequest && <p className="text-xs text-muted-foreground">{getRequestDisplayCode(request.relatedRequest)}</p>}
                      </div>
                    </div>
                    {rexanApprovalPreview && (
                      <div className="rounded-md border bg-background p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">Resultado</span>
                          <Badge variant={getRexanOutcomeBadgeTone(rexanApprovalPreview.outcome)}>{getComputedOutcomeLabel(rexanApprovalPreview.outcome)}</Badge>
                        </div>
                        {rexanApprovalPreview.outcome === REXAN_OUTCOME.EXACT ? (
                          <p className="mt-2 text-muted-foreground">El total rendido coincide con el anticipo. No queda diferencia pendiente.</p>
                        ) : (
                          <p className="mt-2 text-muted-foreground">
                            {getComputedOutcomeDifferenceLabel(rexanApprovalPreview.outcome)}: {formatRequestCurrency(rexanApprovalPreview.balanceAmount, request.currency)}.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="rounded-md bg-muted p-3 text-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Monto del anticipo</p>
                      <p className="text-base font-semibold">{formatRequestCurrency(normalizeMoneyAmount(request.requested_amount) ?? 0, request.currency)}</p>
                      <p className="mt-2 text-muted-foreground">
                        Compara el gasto validado con el monto del anticipo. Si es igual, la rendición se aprueba sin saldo; si es menor, se registra devolución; si es mayor, el saldo adicional pasa a Cola de Pagos.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="validated-spent-amount">Gasto validado *</label>
                      <Input id="validated-spent-amount" type="number" min="0" step="0.01" value={validatedSpentAmount} onChange={(event) => setValidatedSpentAmount(event.target.value)} placeholder="0.00" />
                    </div>
                    <div className="rounded-md border p-3 text-sm">
                      <p className="font-medium">Ejemplos rápidos</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                        <li>Gasto validado igual al anticipo: rendición exacta, sin saldo pendiente.</li>
                        <li>Gasto validado menor al anticipo: devolución por la diferencia y constancia obligatoria.</li>
                        <li>Gasto validado mayor al anticipo: saldo adicional por pagar en Cola de Pagos.</li>
                      </ul>
                    </div>
                  </>
                )}
                {rexanApprovalPreview && !hasStructuredGeneratedReport && (
                  <div className="rounded-md border bg-muted p-3 text-sm" aria-live="polite">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">Resultado previsto</span>
                      <Badge variant={getRexanOutcomeBadgeTone(rexanApprovalPreview.outcome)}>{getRexanOutcomeLabel(rexanApprovalPreview.outcome)}</Badge>
                    </div>
                    <p className="mt-1 font-medium">{rexanApprovalPreview.message}</p>
                    <p className="mt-1 text-muted-foreground">{getRexanOutcomeDescription(rexanApprovalPreview.outcome)}</p>
                  </div>
                )}
                {isStructuredGeneratedDevolucion && (
                  <div className="space-y-3 rounded-md border bg-background p-3 text-sm">
                    <div className="space-y-1">
                      <p className="font-medium">Constancias de devolución por línea POA</p>
                      <p className="text-muted-foreground">Revisa que cada línea con saldo a devolver tenga monto registrado y constancia propia. No se selecciona una constancia global para este informe generado.</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="py-2 pr-3 font-medium">Línea POA</th>
                            <th className="py-2 pr-3 font-medium">Debe devolver</th>
                            <th className="py-2 pr-3 font-medium">Devuelto registrado</th>
                            <th className="py-2 pr-3 font-medium">Constancia</th>
                            <th className="py-2 font-medium">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {structuredReturnRows.length === 0 ? (
                            <tr>
                              <td className="py-3 text-muted-foreground" colSpan={5}>No se encontraron líneas de devolución en el informe generado. Observa la rendición para que el solicitante regenere el informe actualizado.</td>
                            </tr>
                          ) : structuredReturnRows.map((row) => {
                            const proofUrl = getSafeDocumentUrl(row.proof?.drive_web_url);
                            return (
                              <tr key={row.allocationId}>
                                <td className="py-2 pr-3 font-medium">{row.label}</td>
                                <td className="py-2 pr-3">{formatRequestCurrency(row.expectedAmount, request.currency)}</td>
                                <td className="py-2 pr-3">{row.registeredAmount === null ? "Pendiente" : formatRequestCurrency(row.registeredAmount, request.currency)}</td>
                                <td className="py-2 pr-3">
                                  {row.proofName ? (
                                    proofUrl ? <a className="text-primary underline-offset-4 hover:underline focus-visible:underline" href={proofUrl} target="_blank" rel="noreferrer">{row.proofName}</a> : <span>{row.proofName}</span>
                                  ) : "Pendiente"}
                                </td>
                                <td className="py-2"><Badge variant={row.isComplete ? "default" : "destructive"}>{row.isComplete ? "válida" : "pendiente"}</Badge></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {isStructuredReturnIncomplete && (
                      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                        <p>{structuredReturnRows.length === 0 ? "No hay detalle de líneas para validar la devolución." : `Hay ${incompleteStructuredReturnRows.length === 1 ? "una línea pendiente" : `${incompleteStructuredReturnRows.length} líneas pendientes`}.`} Observa la rendición y solicita corregir Saldos por línea POA &gt; Registrar devolución; luego el solicitante debe guardar, regenerar el informe actualizado y reenviar.</p>
                        <Button type="button" className="mt-3" variant="outline" onClick={handleRequestReturnProof}>
                          Solicitar corrección de devolución
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {rexanPreviewOutcome === REXAN_OUTCOME.DEVOLUCION && !isStructuredGeneratedDevolucion && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="return-proof-document">Constancia de devolución *</label>
                    <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                      Obligatorio para devolución: selecciona una constancia de devolución por {rexanApprovalPreview ? formatRequestCurrency(rexanApprovalPreview.balanceAmount, request.currency) : "la diferencia"} antes de aprobar.
                    </p>
                    {returnProofDocuments.length > 0 ? (
                      <Select value={returnProofDocumentId} onValueChange={setReturnProofDocumentId}>
                        <SelectTrigger id="return-proof-document"><SelectValue placeholder="Selecciona constancia" /></SelectTrigger>
                        <SelectContent>
                          {returnProofDocuments.map((document) => (
                            <SelectItem key={document.id} value={document.id}>{getRequestDocumentDisplayName(document)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                        <p>Para aprobar una devolución, primero solicita al solicitante que vaya a Saldos por línea POA, use Registrar devolución, adjunte o seleccione la constancia de esa línea, guarde el cambio y regenere el informe actualizado.</p>
                        <Button type="button" variant="outline" onClick={handleRequestReturnProof}>
                          Solicitar constancia
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <Textarea value={approveComment} onChange={(event) => setApproveComment(event.target.value)} rows={3} placeholder="Comentario opcional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setApproveOpen(false)} disabled={approving}>Cancelar</Button>
            <Button type="button" onClick={() => void handleApprove()} disabled={approving || isRexanReturnProofMissing || isStructuredReturnIncomplete}>{approving ? "Aprobando..." : reviewCopy.approveSubmit}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewCopy.rejectTitle}</DialogTitle>
            <DialogDescription>{reviewCopy.rejectDescription}</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={4} placeholder="Motivo del rechazo *" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={() => void handleReject()} disabled={rejecting}>{rejecting ? "Rechazando..." : reviewCopy.rejectSubmit}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
