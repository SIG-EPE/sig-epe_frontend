"use client";

import { Fragment } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/requests/status-badge";
import { PaymentAllocationProofCoverage } from "@/components/payments/payment-allocation-proof-coverage";
import { REQUEST_TYPE_LABELS, formatRequestCurrency, formatRequestDate, getPaymentId, getPaymentPendingBadges, getPaymentRequestParty, getPlanningLineDisplay, getRequestPayableAmount, hasPaymentDetailsPending, hasPaymentProofPending, isRexanExcessRequest } from "@/lib/requests";
import { REQUEST_STATUS, type PaymentRequest } from "@/types/requests";

interface PaymentQueueTableProps {
  requests: PaymentRequest[];
  isLoading: boolean;
  onRegisterPayment: (request: PaymentRequest) => void;
  selectedRequestIds?: string[];
  onToggleRequest?: (requestId: string, checked: boolean) => void;
  onToggleAll?: (checked: boolean) => void;
  onCompletePaymentDetails?: (request: PaymentRequest) => void;
  onAttachPaymentProof?: (request: PaymentRequest) => void;
}

export function PaymentQueueTable({ requests, isLoading, onRegisterPayment, selectedRequestIds = [], onToggleRequest, onToggleAll, onCompletePaymentDetails, onAttachPaymentProof }: PaymentQueueTableProps) {
  if (isLoading) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">Cargando cola de pagos...</p>;
  }

  if (requests.length === 0) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">No hay solicitudes para este filtro.</p>;
  }

  const selectableRequests = requests.filter((request) => request.status === REQUEST_STATUS.APPROVED);
  const allSelectableSelected = selectableRequests.length > 0 && selectableRequests.every((request) => selectedRequestIds.includes(request.id));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {onToggleRequest && <TableHead className="w-10"><span className="sr-only">Seleccionar</span></TableHead>}
          <TableHead>Código</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Solicitante / proveedor</TableHead>
          <TableHead>Área</TableHead>
          <TableHead className="text-right">Monto</TableHead>
          <TableHead>Aprobación / estado</TableHead>
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
        {requests.map((request) => {
          const allocationCount = request.allocation_count ?? request.allocations?.length ?? 0;
          const hasAllocations = allocationCount > 0;
          const isPendingPayment = request.status === REQUEST_STATUS.APPROVED;
          const canAttachAllocationProof = Boolean(onAttachPaymentProof && request.status === REQUEST_STATUS.PAID && getPaymentId(request) && hasAllocations);
          const firstAllocationLine = request.allocations?.[0]?.planning_line ?? request.allocations?.[0]?.budgetPlanningLine;
          const areaSummary = allocationCount > 1
            ? `${allocationCount} líneas POA · ${request.allocations?.[0]?.org_unit?.name ?? getPlanningLineDisplay(firstAllocationLine)}`
            : request.organizationalUnit?.name ?? request.allocations?.[0]?.org_unit?.name ?? getPlanningLineDisplay(firstAllocationLine ?? request.budgetPlanningLine);

          return (
          <Fragment key={request.id}>
          <TableRow data-testid="payment-queue-row">
            {onToggleRequest && (
              <TableCell>
                {request.status === REQUEST_STATUS.APPROVED ? (
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
            <TableCell className="font-medium whitespace-nowrap">{request.request_code ?? request.sequential_number ?? "—"}</TableCell>
            <TableCell className="whitespace-nowrap">{REQUEST_TYPE_LABELS[request.request_type]}</TableCell>
            <TableCell className="max-w-xs truncate">{getPaymentRequestParty(request)}</TableCell>
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
                {getPaymentPendingBadges(request).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {getPaymentPendingBadges(request).map((label) => <Badge key={label} variant="outline">{label}</Badge>)}
                  </div>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex flex-col items-end gap-2">
                {request.status === REQUEST_STATUS.APPROVED ? (
                  <Button size="sm" onClick={() => onRegisterPayment(request)} data-testid="register-payment-button">Registrar pago</Button>
                ) : (hasPaymentProofPending(request) || hasPaymentDetailsPending(request)) && getPaymentId(request) ? (
                  <Button size="sm" variant="outline" onClick={() => onCompletePaymentDetails?.(request)} data-testid="complete-payment-details-button">Completar datos</Button>
                ) : (
                  <span className="text-sm text-muted-foreground">Registrado</span>
                )}
                {canAttachAllocationProof && (
                  <Button size="sm" variant="outline" onClick={() => onAttachPaymentProof?.(request)} data-testid="attach-payment-proof-button">Agregar comprobante POA</Button>
                )}
              </div>
            </TableCell>
          </TableRow>
          {hasAllocations && (
            <TableRow data-testid="payment-allocation-accordion-row">
              <TableCell colSpan={onToggleRequest ? 8 : 7} className="bg-muted/30 p-0">
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
    </Table>
  );
}
