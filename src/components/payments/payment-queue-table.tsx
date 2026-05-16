"use client";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/requests/status-badge";
import { REQUEST_TYPE_LABELS, formatRequestCurrency, formatRequestDate, getPaymentRequestParty, getPlanningLineDisplay } from "@/lib/requests";
import { REQUEST_STATUS, type PaymentRequest } from "@/types/requests";

interface PaymentQueueTableProps {
  requests: PaymentRequest[];
  isLoading: boolean;
  onRegisterPayment: (request: PaymentRequest) => void;
}

export function PaymentQueueTable({ requests, isLoading, onRegisterPayment }: PaymentQueueTableProps) {
  if (isLoading) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">Cargando cola de pagos...</p>;
  }

  if (requests.length === 0) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">No hay solicitudes para este filtro.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
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
        {requests.map((request) => (
          <TableRow key={request.id} data-testid="payment-queue-row">
            <TableCell className="font-medium whitespace-nowrap">{request.request_code ?? request.sequential_number ?? "—"}</TableCell>
            <TableCell className="whitespace-nowrap">{REQUEST_TYPE_LABELS[request.request_type]}</TableCell>
            <TableCell className="max-w-xs truncate">{getPaymentRequestParty(request)}</TableCell>
            <TableCell className="max-w-xs truncate">{request.organizationalUnit?.name ?? getPlanningLineDisplay(request.budgetPlanningLine)}</TableCell>
            <TableCell className="text-right font-medium">{formatRequestCurrency(Number(request.requested_amount), request.currency)}</TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                <span className="text-sm">{formatRequestDate(request.approved_at ?? request.payment?.created_at ?? request.paid_at)}</span>
                <StatusBadge status={request.status} />
              </div>
            </TableCell>
            <TableCell className="text-right">
              {request.status === REQUEST_STATUS.APPROVED ? (
                <Button size="sm" onClick={() => onRegisterPayment(request)} data-testid="register-payment-button">Registrar pago</Button>
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
