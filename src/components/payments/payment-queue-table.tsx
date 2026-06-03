"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/requests/status-badge";
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
}

export function PaymentQueueTable({ requests, isLoading, onRegisterPayment, selectedRequestIds = [], onToggleRequest, onToggleAll, onCompletePaymentDetails }: PaymentQueueTableProps) {
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
        {requests.map((request) => (
          <TableRow key={request.id} data-testid="payment-queue-row">
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
            <TableCell className="max-w-xs truncate">{request.organizationalUnit?.name ?? getPlanningLineDisplay(request.budgetPlanningLine)}</TableCell>
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
              {request.status === REQUEST_STATUS.APPROVED ? (
                <Button size="sm" onClick={() => onRegisterPayment(request)} data-testid="register-payment-button">Registrar pago</Button>
              ) : (hasPaymentProofPending(request) || hasPaymentDetailsPending(request)) && getPaymentId(request) ? (
                <Button size="sm" variant="outline" onClick={() => onCompletePaymentDetails?.(request)} data-testid="complete-payment-details-button">Completar datos</Button>
              ) : (
                <span className="text-sm text-muted-foreground">Registrado</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
