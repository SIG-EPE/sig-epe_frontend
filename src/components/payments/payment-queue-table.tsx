"use client";

import { Fragment } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/requests/status-badge";
import { DriveProjectionState } from "@/components/requests/drive-projection-state";
import { PaymentAllocationProofCoverage } from "@/components/payments/payment-allocation-proof-coverage";
import { PaymentCompletenessStatus } from "@/components/payments/payment-completeness-status";
import { getDriveRouteModelLabel } from "@/components/payments/payment-form-sections";
import { QueueTableRowsSkeleton } from "@/components/performance/route-skeletons";
import { ROUTES } from "@/lib/constants";
import { getSafeDocumentUrl } from "@/lib/safe-url";
import { REQUEST_TYPE_LABELS, formatRequestCurrency, formatRequestDate, getPaymentId, getPaymentProofDisplayItems, getPaymentRexanStatusLabel, getPlanningLineDisplay, getRegisteredByDisplayName, getRegisteredPartyDisplay, getRegisteredPartyDocumentLabel, getRequestPayableAmount, isRexanExcessRequest } from "@/lib/requests";
import { getPaymentCompletenessPresentation } from "@/lib/payment-completeness";
import { REQUEST_STATUS, type PaymentRequest } from "@/types/requests";
import { GiofWorkStatus } from "@/components/giof-work/giof-work-controls";
import { canOperateAssignedGiofWork } from "@/lib/role-capabilities";
import { isGiofLeaseCurrent } from "@/lib/giof-work-lease-session";
import { GIOF_WORK_POOL, type GiofWorkLease } from "@/types/giof-work";
import { REQUEST_STATUS_SURFACE } from "@/lib/request-status-vocabulary";

interface PaymentQueueTableProps {
  requests: PaymentRequest[];
  isLoading: boolean;
  onRegisterPayment: (request: PaymentRequest) => void;
  selectedRequestIds?: string[];
  onToggleRequest?: (requestId: string, checked: boolean) => void;
  onToggleAll?: (checked: boolean) => void;
  onCompletePaymentDetails?: (request: PaymentRequest) => void;
  onAttachPaymentProof?: (request: PaymentRequest) => void;
  onRetryRexanActivation?: (request: PaymentRequest) => void;
  currentUserId?: string | null;
  isGiofManager?: boolean;
  canManagePayments?: boolean;
  paymentLeases?: GiofWorkLease[];
  selectedAssignmentIds?: string[];
  onToggleAssignment?: (requestId: string, checked: boolean) => void;
  onToggleAllAssignments?: (checked: boolean) => void;
  maxSelectedRequests?: number;
}

export function isBulkPaymentSelectable(request: PaymentRequest, currentUserId?: string | null): boolean {
  const work = request.giof_work;
  if (request.status !== REQUEST_STATUS.APPROVED || request.payment || request.payment_id || !work || work.pool !== GIOF_WORK_POOL.PAYMENT || !currentUserId) return false;
  if (work.assigneeId !== null && work.assigneeId !== currentUserId) return false;
  const foreignLeaseIsActive = Boolean(
    work.lease?.ownerId
      && work.lease.ownerId !== currentUserId
      && work.lease.expiresAt
      && new Date(work.lease.expiresAt).getTime() > Date.now(),
  );
  return !foreignLeaseIsActive;
}

export function PaymentQueueTable({ requests, isLoading, onRegisterPayment, selectedRequestIds = [], onToggleRequest, onToggleAll, onCompletePaymentDetails, onRetryRexanActivation, currentUserId, isGiofManager = false, canManagePayments = true, paymentLeases = [], selectedAssignmentIds = [], onToggleAssignment, onToggleAllAssignments, maxSelectedRequests = 5 }: PaymentQueueTableProps) {
  if (isLoading) {
    return <QueueTableRowsSkeleton rows={5} columns={7} />;
  }

  if (requests.length === 0) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">No hay solicitudes para este filtro.</p>;
  }

  const selectableRequests = requests.filter((request) => isBulkPaymentSelectable(request, currentUserId));
  const assignableRequests = requests.filter((request) => request.giof_work?.canAssign === true);
  const allSelectableSelected = selectableRequests.length > 0 && selectableRequests.every((request) => selectedRequestIds.includes(request.id));
  const allAssignableSelected = assignableRequests.length > 0 && assignableRequests.every((request) => selectedAssignmentIds.includes(request.id));
  const someSelectableSelected = selectableRequests.some((request) => selectedRequestIds.includes(request.id));
  const someAssignableSelected = assignableRequests.some((request) => selectedAssignmentIds.includes(request.id));
  const paymentSelectAllState = allSelectableSelected ? true : someSelectableSelected ? "indeterminate" : false;
  const assignmentSelectAllState = allAssignableSelected ? true : someAssignableSelected ? "indeterminate" : false;

  return (
    <div className="overflow-x-auto"><Table>
      <TableHeader>
        <TableRow>
          {onToggleRequest && (
            <TableHead className="w-28 min-w-28">
              <div className="flex flex-col items-start gap-1.5 py-1">
                <span className="leading-none">Pago masivo</span>
                <div className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-normal text-muted-foreground">
                  <Checkbox
                    checked={paymentSelectAllState}
                    disabled={!onToggleAll || selectableRequests.length === 0}
                    onCheckedChange={(checked) => onToggleAll?.(checked === true)}
                    aria-label="Seleccionar solicitudes elegibles de esta página para pago masivo"
                    data-testid="payment-select-all-checkbox"
                  />
                   <span aria-hidden="true">Máximo {maxSelectedRequests} de esta página</span>
                </div>
              </div>
            </TableHead>
          )}
          <TableHead>Código</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>A nombre de</TableHead>
          <TableHead>Área</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Fechas / estado</TableHead>
          <TableHead className="min-w-40">
            <div className="flex flex-col items-start gap-1.5 py-1">
              <span className="leading-none">Asignación</span>
              {isGiofManager && onToggleAllAssignments ? (
                <div className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-normal text-muted-foreground">
                  <Checkbox
                    checked={assignmentSelectAllState}
                    disabled={assignableRequests.length === 0}
                    onCheckedChange={(checked) => onToggleAllAssignments(checked === true)}
                    aria-label="Seleccionar esta página"
                    data-testid="assignment-select-all-checkbox"
                  />
                  <span aria-hidden="true">Seleccionar esta página</span>
                </div>
              ) : null}
            </div>
          </TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => {
          const canOperate = canOperateAssignedGiofWork(request.giof_work, currentUserId);
          const hasActivePaymentLease = Boolean(
            canOperate
              && request.giof_work
              && isGiofLeaseCurrent(
                paymentLeases.find((lease) => lease.requestId === request.id),
                {
                  requestId: request.id,
                  pool: GIOF_WORK_POOL.PAYMENT,
                  assignmentVersion: request.giof_work.assignmentVersion,
                  ownerId: currentUserId,
                },
              ),
          );
          const allocationCount = request.allocation_count ?? request.allocations?.length ?? 0;
          const hasAllocations = allocationCount > 0;
          const isPendingPayment = request.status === REQUEST_STATUS.APPROVED;
          const paymentProofUrl = request.status === REQUEST_STATUS.PAID
            ? getPaymentProofDisplayItems(request.payment).find((item) => item.url)?.url ?? getSafeDocumentUrl(request.payment?.proofDocument?.drive_web_url)
            : null;
          const firstAllocationLine = request.allocations?.[0]?.planning_line ?? request.allocations?.[0]?.budgetPlanningLine;
          const areaSummary = allocationCount > 1
            ? `${allocationCount} líneas POA · ${request.allocations?.[0]?.org_unit?.name ?? getPlanningLineDisplay(firstAllocationLine)}`
            : request.organizationalUnit?.name ?? request.allocations?.[0]?.org_unit?.name ?? getPlanningLineDisplay(firstAllocationLine ?? request.budgetPlanningLine);
          const registeredParty = getRegisteredPartyDisplay(request);
          const registeredPartyDocument = getRegisteredPartyDocumentLabel(request);
          const registeredBy = getRegisteredByDisplayName(request);
          const paymentCompleteness = getPaymentCompletenessPresentation({
            completeness: request.payment?.completeness,
            missing_fields: request.payment?.missing_fields,
            proof_pending: request.payment?.proof_pending ?? request.payment_proof_pending ?? request.proof_pending,
            details_pending: request.payment?.details_pending ?? request.payment_details_pending ?? request.details_pending,
          });
          const assignmentDisabledReason = request.status === REQUEST_STATUS.PAID
            ? "Trabajo de pago completo: no hay constancia ni referencia pendiente"
            : "No asignable en su estado actual";

          return (
          <Fragment key={request.id}>
          <TableRow data-testid="payment-queue-row">
            {onToggleRequest && (
              <TableCell>
                {isBulkPaymentSelectable(request, currentUserId) ? (
                   <Checkbox
                     checked={selectedRequestIds.includes(request.id)}
                     disabled={!selectedRequestIds.includes(request.id) && selectedRequestIds.length >= maxSelectedRequests}
                     title={!selectedRequestIds.includes(request.id) && selectedRequestIds.length >= maxSelectedRequests ? `Puedes seleccionar como máximo ${maxSelectedRequests} solicitudes.` : undefined}
                    onCheckedChange={(checked) => onToggleRequest(request.id, checked === true)}
                    aria-label={`Seleccionar ${request.request_code ?? request.sequential_number ?? request.id} para pago masivo`}
                    data-testid="payment-row-checkbox"
                  />
                ) : null}
              </TableCell>
            )}
            <TableCell className="font-medium whitespace-nowrap">{request.request_code ?? request.sequential_number ?? "—"}</TableCell>
            <TableCell className="whitespace-nowrap">{REQUEST_TYPE_LABELS[request.request_type]}</TableCell>
            <TableCell className="max-w-xs">
              <div className="flex flex-col gap-1">
                <span className="truncate font-medium">{registeredParty}</span>
                <span className="truncate text-xs text-muted-foreground">{registeredPartyDocument}</span>
                <span className="truncate text-xs text-muted-foreground">Registrado por: {registeredBy}</span>
              </div>
            </TableCell>
            <TableCell className="max-w-xs truncate">{areaSummary}</TableCell>
            <TableCell className="text-right font-medium">
              <div className="flex flex-col gap-1">
                <span>{formatRequestCurrency(getRequestPayableAmount(request), request.currency)}</span>
                {isRexanExcessRequest(request) && <span className="text-xs font-normal text-muted-foreground">Saldo REXAN</span>}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                {request.status === REQUEST_STATUS.PAID ? (
                  <>
                    <span className="text-sm">Fecha de pago: {formatRequestDate(request.payment?.paid_at ?? request.paid_at)}</span>
                    {request.payment?.drive_route_classified_at ? (
                      <span className="text-xs text-muted-foreground">Registrado en SIG-EPE: {formatRequestDate(request.payment.drive_route_classified_at)}</span>
                    ) : null}
                    {request.payment?.drive_routing_date ? (
                      <span className="text-xs text-muted-foreground">Fecha de destino: {formatRequestDate(request.payment.drive_routing_date)}</span>
                    ) : null}
                    <span className="text-xs text-muted-foreground">{getDriveRouteModelLabel(request.payment?.drive_route_model)}</span>
                  </>
                ) : (
                  <span className="text-sm">Aprobado: {formatRequestDate(request.approved_at)}</span>
                )}
                <StatusBadge status={request.status} context={request} surface={REQUEST_STATUS_SURFACE.PAYMENT} />
                {request.rexan_activation && (
                  <Badge variant={request.rexan_activation.status === "FAILED" ? "destructive" : "secondary"}>
                    {getPaymentRexanStatusLabel(request.rexan_activation.status, false)}
                  </Badge>
                )}
                {request.payment ? (
                  <DriveProjectionState payment={request.payment} compact />
                ) : null}
                {request.status === REQUEST_STATUS.PAID ? <PaymentCompletenessStatus request={request} /> : null}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex min-w-36 items-start gap-2">
                {isGiofManager ? (
                  <Checkbox
                    className="mt-0.5"
                    checked={selectedAssignmentIds.includes(request.id)}
                    disabled={request.giof_work?.canAssign !== true}
                    title={request.giof_work?.canAssign === true ? "Seleccionar para asignar" : assignmentDisabledReason}
                    onCheckedChange={(checked) => onToggleAssignment?.(request.id, checked === true)}
                    aria-label={request.giof_work?.canAssign === true ? `Seleccionar ${request.request_code ?? "pago"} para asignar` : `${request.request_code ?? "Pago"}: ${request.status === REQUEST_STATUS.PAID ? "trabajo de pago completo" : "no asignable en su estado actual"}`}
                  />
                ) : null}
                <GiofWorkStatus requestId={request.id} work={request.giof_work} currentUserId={currentUserId} isManager={isGiofManager} />
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex flex-col items-end gap-2">
                 {canManagePayments && request.status === REQUEST_STATUS.APPROVED && hasActivePaymentLease ? (
                   <Button size="sm" onClick={() => onRegisterPayment(request)} data-testid="register-payment-button">Registrar pago</Button>
                 ) : canManagePayments && request.status === REQUEST_STATUS.APPROVED && canOperate ? (
                   <Button size="sm" onClick={() => onRegisterPayment(request)} data-testid="process-payment-button">Procesar</Button>
                  ) : canManagePayments && paymentCompleteness.hasPendingDetails && getPaymentId(request) && canOperate ? (
                  <Button size="sm" variant="outline" onClick={() => onCompletePaymentDetails?.(request)} data-testid="complete-payment-details-button">Completar pago</Button>
                 ) : request.status === REQUEST_STATUS.PAID ? (
                   <span className="text-sm text-muted-foreground">Registrado</span>
                 ) : (
                   null
                 )}
                 {request.rexan_activation?.status === "FAILED" && onRetryRexanActivation && (canOperate || isGiofManager) && (
                  <Button size="sm" variant="outline" onClick={() => onRetryRexanActivation(request)} data-testid="retry-rexan-button">
                    Reintentar REXAN
                  </Button>
                 )}
                {(request.status === REQUEST_STATUS.PAID || !canOperate) && (
                  <>
                    <Button size="sm" variant="ghost" asChild>
                       <a href={`${ROUTES.REQUESTS}/${request.id}`}>{request.status === REQUEST_STATUS.PAID ? "Ver solicitud" : "Ver"}</a>
                    </Button>
                    {paymentProofUrl && (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={paymentProofUrl} target="_blank" rel="noopener noreferrer">Ver constancia</a>
                      </Button>
                    )}
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
          {hasAllocations && (
            <TableRow data-testid="payment-allocation-accordion-row">
              <TableCell colSpan={(onToggleRequest ? 1 : 0) + 8} className="bg-muted/30 p-0">
                <details className="group px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground group-open:mb-3" data-testid="payment-allocation-accordion-summary">
                    {isPendingPayment ? "Desglose de líneas POA incluidas en el pago" : "Líneas POA cubiertas por la constancia global"}
                  </summary>
                  <PaymentAllocationProofCoverage request={request} mode="register-general-proof" />
                </details>
              </TableCell>
            </TableRow>
          )}
          </Fragment>
        );})}
      </TableBody>
    </Table></div>
  );
}
