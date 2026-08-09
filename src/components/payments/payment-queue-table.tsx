"use client";

import { Fragment } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/requests/status-badge";
import { PaymentAllocationProofCoverage } from "@/components/payments/payment-allocation-proof-coverage";
import { QueueTableRowsSkeleton } from "@/components/performance/route-skeletons";
import { ROUTES } from "@/lib/constants";
import { getSafeDocumentUrl } from "@/lib/safe-url";
import { REQUEST_TYPE_LABELS, formatRequestCurrency, formatRequestDate, getPaymentId, getPaymentPendingBadges, getPaymentProofDisplayItems, getPaymentRexanStatusLabel, getPlanningLineDisplay, getRegisteredByDisplayName, getRegisteredPartyDisplay, getRegisteredPartyDocumentLabel, getRequestPayableAmount, hasAllAllocationPaymentProofCoverage, hasPaymentDetailsPending, hasPaymentProofPending, isRexanExcessRequest } from "@/lib/requests";
import { REQUEST_STATUS, type PaymentRequest } from "@/types/requests";
import { GiofWorkStatus } from "@/components/giof-work/giof-work-controls";

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
  selectedAssignmentIds?: string[];
  onToggleAssignment?: (requestId: string, checked: boolean) => void;
  onToggleAllAssignments?: (checked: boolean) => void;
}

export function PaymentQueueTable({ requests, isLoading, onRegisterPayment, selectedRequestIds = [], onToggleRequest, onToggleAll, onCompletePaymentDetails, onAttachPaymentProof, onRetryRexanActivation, currentUserId, isGiofManager = false, selectedAssignmentIds = [], onToggleAssignment, onToggleAllAssignments }: PaymentQueueTableProps) {
  if (isLoading) {
    return <QueueTableRowsSkeleton rows={5} columns={7} />;
  }

  if (requests.length === 0) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">No hay solicitudes para este filtro.</p>;
  }

  const selectableRequests = requests.filter((request) => request.status === REQUEST_STATUS.APPROVED && request.giof_work?.canAcquire === true);
  const assignableRequests = requests.filter((request) => request.giof_work?.canAssign === true);
  const allSelectableSelected = selectableRequests.length > 0 && selectableRequests.every((request) => selectedRequestIds.includes(request.id));

  return (
    <div className="overflow-x-auto"><Table>
      <TableHeader>
        <TableRow>
          {onToggleRequest && <TableHead className="w-10"><span className="sr-only">Seleccionar</span></TableHead>}
          {isGiofManager && <TableHead className="w-10"><span className="sr-only">Seleccionar para asignar</span></TableHead>}
          <TableHead>Código</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>A nombre de</TableHead>
          <TableHead>Área</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Aprobación / estado</TableHead>
          <TableHead>Asignación</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {onToggleRequest && selectableRequests.length > 0 && (
          <TableRow>
            <TableCell colSpan={8}>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={allSelectableSelected}
                  onChange={(event) => onToggleAll?.(event.target.checked)}
                  data-testid="payment-select-all-checkbox"
                />
                Seleccionar solicitudes visibles para pago masivo
              </label>
            </TableCell>
          </TableRow>
        )}
        {isGiofManager && onToggleAllAssignments && assignableRequests.length > 0 && (
          <TableRow><TableCell colSpan={10}><label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" className="size-4" checked={assignableRequests.every((request) => selectedAssignmentIds.includes(request.id))} onChange={(event) => onToggleAllAssignments(event.target.checked)} />Seleccionar trabajos asignables visibles</label></TableCell></TableRow>
        )}
        {requests.map((request) => {
          const canOperate = request.giof_work?.canAcquire === true;
          const allocationCount = request.allocation_count ?? request.allocations?.length ?? 0;
          const hasAllocations = allocationCount > 0;
          const isPendingPayment = request.status === REQUEST_STATUS.APPROVED;
          const canAttachAllocationProof = Boolean(onAttachPaymentProof && request.status === REQUEST_STATUS.PAID && getPaymentId(request) && hasAllocations && !hasAllAllocationPaymentProofCoverage(request));
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
          const assignmentDisabledReason = request.status === REQUEST_STATUS.PAID
            ? "Trabajo de pago completo: no hay constancia ni referencia pendiente"
            : "No asignable en su estado actual";

          return (
          <Fragment key={request.id}>
          <TableRow data-testid="payment-queue-row">
            {onToggleRequest && (
              <TableCell>
                {request.status === REQUEST_STATUS.APPROVED && canOperate ? (
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selectedRequestIds.includes(request.id)}
                    onChange={(event) => onToggleRequest(request.id, event.target.checked)}
                    aria-label={`Seleccionar ${request.request_code ?? request.sequential_number ?? request.id}`}
                    data-testid="payment-row-checkbox"
                  />
                ) : null}
              </TableCell>
            )}
            {isGiofManager && <TableCell><input type="checkbox" className="size-4" checked={selectedAssignmentIds.includes(request.id)} disabled={request.giof_work?.canAssign !== true} title={request.giof_work?.canAssign === true ? "Seleccionar para asignar" : assignmentDisabledReason} onChange={(event) => onToggleAssignment?.(request.id, event.target.checked)} aria-label={request.giof_work?.canAssign === true ? `Seleccionar ${request.request_code ?? "pago"} para asignar` : `${request.request_code ?? "Pago"}: ${request.status === REQUEST_STATUS.PAID ? "trabajo de pago completo" : "no asignable en su estado actual"}`} /></TableCell>}
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
                <span className="text-sm">{formatRequestDate(request.approved_at ?? request.payment?.created_at ?? request.paid_at)}</span>
                <StatusBadge status={request.status} context={request} />
                {request.rexan_activation && (
                  <Badge variant={request.rexan_activation.status === "FAILED" ? "destructive" : "secondary"}>
                    {getPaymentRexanStatusLabel(request.rexan_activation.status)}
                  </Badge>
                )}
                {getPaymentPendingBadges(request).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {getPaymentPendingBadges(request).map((label) => <Badge key={label} variant="outline">{label}</Badge>)}
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell><GiofWorkStatus requestId={request.id} work={request.giof_work} currentUserId={currentUserId} isManager={isGiofManager} /></TableCell>
            <TableCell className="text-right">
              <div className="flex flex-col items-end gap-2">
                {request.status === REQUEST_STATUS.APPROVED && request.giof_work?.canAcquire ? (
                  <Button size="sm" onClick={() => onRegisterPayment(request)} data-testid="register-payment-button">Registrar pago</Button>
                ) : (hasPaymentProofPending(request) || hasPaymentDetailsPending(request)) && getPaymentId(request) && canOperate ? (
                  <Button size="sm" variant="outline" onClick={() => onCompletePaymentDetails?.(request)} data-testid="complete-payment-details-button">Completar datos</Button>
                ) : (
                  <span className="text-sm text-muted-foreground">Registrado</span>
                )}
                {canAttachAllocationProof && canOperate && (
                  <Button size="sm" variant="outline" onClick={() => onAttachPaymentProof?.(request)} data-testid="attach-payment-proof-button">Agregar comprobante POA</Button>
                )}
                {request.rexan_activation?.status === "FAILED" && onRetryRexanActivation && canOperate && (
                  <Button size="sm" variant="outline" onClick={() => onRetryRexanActivation(request)} data-testid="retry-rexan-button">
                    Reintentar REXAN
                  </Button>
                )}
                {(request.status === REQUEST_STATUS.PAID || !canOperate) && (
                  <>
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`${ROUTES.REQUESTS}/${request.id}`}>Ver solicitud</a>
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
              <TableCell colSpan={(onToggleRequest ? 1 : 0) + (isGiofManager ? 1 : 0) + 9} className="bg-muted/30 p-0">
                <details className="group px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground group-open:mb-3" data-testid="payment-allocation-accordion-summary">
                    {isPendingPayment ? "Desglose de líneas POA incluidas en el pago" : "Desglose de líneas POA y cobertura de comprobantes"}
                  </summary>
                  <PaymentAllocationProofCoverage request={request} mode={isPendingPayment ? "register-general-proof" : "specific-proofs"} />
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
