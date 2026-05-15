"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePaymentQueue } from "@/hooks/use-requests";
import { PAYMENT_QUEUE_STATUS, formatRequestCurrency, getApiErrorMessage } from "@/lib/requests";
import { cn } from "@/lib/utils";
import { REQUEST_STATUS, type PaymentRequest } from "@/types/requests";
import { PaymentQueueTable } from "./payment-queue-table";
import { RegisterPaymentModal } from "./register-payment-modal";

type PaymentQueueTab = typeof REQUEST_STATUS.APPROVED | typeof REQUEST_STATUS.PAID;

export function PaymentQueuePage() {
  const [status, setStatus] = useState<PaymentQueueTab>(PAYMENT_QUEUE_STATUS.PENDING);
  const [search, setSearch] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const activeQueue = usePaymentQueue({ status, search: search.trim() || undefined, page: 1, limit: 20 });
  const pendingQueue = usePaymentQueue({ status: PAYMENT_QUEUE_STATUS.PENDING, page: 1, limit: 100 });
  const paidQueue = usePaymentQueue({ status: PAYMENT_QUEUE_STATUS.PAID, page: 1, limit: 100 });
  const pendingTotal = pendingQueue.requests.reduce((total, request) => total + Number(request.requested_amount), 0);

  function openRegisterPayment(request: PaymentRequest) {
    setSelectedRequest(request);
    setIsModalOpen(true);
  }

  async function refreshAfterPayment() {
    await Promise.all([activeQueue.refetch(), pendingQueue.refetch(), paidQueue.refetch()]);
    toast.success("Pago registrado correctamente.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cola de Pagos</h1>
        <p className="text-muted-foreground">Gestiona solicitudes aprobadas pendientes de pago y consulta el historial pagado.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Pendientes</CardTitle><CardDescription>Solicitudes aprobadas</CardDescription></CardHeader>
          <CardContent><p className="text-3xl font-bold">{pendingQueue.total}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total pendiente</CardTitle><CardDescription>Monto por transferir</CardDescription></CardHeader>
          <CardContent><p className="text-3xl font-bold">{formatRequestCurrency(pendingTotal)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pagados</CardTitle><CardDescription>Historial consultable</CardDescription></CardHeader>
          <CardContent><p className="text-3xl font-bold">{paidQueue.total}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Solicitudes para pago</CardTitle>
            <CardDescription>{status === REQUEST_STATUS.APPROVED ? "Aprobadas pendientes de transferencia." : "Pagos registrados."}</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-md border p-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setStatus(PAYMENT_QUEUE_STATUS.PENDING)} className={cn(status === REQUEST_STATUS.APPROVED && "bg-primary text-primary-foreground hover:bg-primary/90")} data-testid="payment-filter-approved">Pendientes</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setStatus(PAYMENT_QUEUE_STATUS.PAID)} className={cn(status === REQUEST_STATUS.PAID && "bg-primary text-primary-foreground hover:bg-primary/90")} data-testid="payment-filter-paid">Historial pagado</Button>
            </div>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código o concepto..." className="sm:w-72" data-testid="payment-search-input" />
          </div>
        </CardHeader>
        <CardContent>
          {activeQueue.error ? (
            <div className="space-y-3 rounded-md border border-destructive/40 p-4">
              <p className="text-sm text-destructive">{getApiErrorMessage(activeQueue.error)}</p>
              <Button size="sm" variant="outline" onClick={() => void activeQueue.refetch()}>Reintentar</Button>
            </div>
          ) : (
            <PaymentQueueTable requests={activeQueue.requests} isLoading={activeQueue.isLoading} onRegisterPayment={openRegisterPayment} />
          )}
        </CardContent>
      </Card>

      <RegisterPaymentModal request={selectedRequest} open={isModalOpen} onOpenChange={setIsModalOpen} onSuccess={refreshAfterPayment} />
    </div>
  );
}
