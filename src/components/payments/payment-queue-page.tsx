"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePaymentQueue } from "@/hooks/use-requests";
import { PAYMENT_QUEUE_STATUS, formatRequestCurrency, getApiErrorMessage, getRequestPayableAmount } from "@/lib/requests";
import { cn } from "@/lib/utils";
import { REQUEST_STATUS, type PaymentRequest } from "@/types/requests";
import { PaymentQueueTable } from "./payment-queue-table";
import { RegisterPaymentModal } from "./register-payment-modal";
import { BulkMarkPaidModal } from "./bulk-mark-paid-modal";
import { CompletePaymentDetailsModal } from "./complete-payment-details-modal";
import { AttachPaymentProofModal } from "./attach-payment-proof-modal";

const PAYMENT_QUEUE_TAB = {
  PENDING: REQUEST_STATUS.APPROVED,
  PAID: REQUEST_STATUS.PAID,
  PENDING_DATA: "pending-data",
} as const;

type PaymentQueueTab = (typeof PAYMENT_QUEUE_TAB)[keyof typeof PAYMENT_QUEUE_TAB];

export function PaymentQueuePage() {
  const [status, setStatus] = useState<PaymentQueueTab>(PAYMENT_QUEUE_STATUS.PENDING);
  const [search, setSearch] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  const [completionRequest, setCompletionRequest] = useState<PaymentRequest | null>(null);
  const [proofAssociationRequest, setProofAssociationRequest] = useState<PaymentRequest | null>(null);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [isAttachProofModalOpen, setIsAttachProofModalOpen] = useState(false);
  const activeQueue = usePaymentQueue({
    status: status === PAYMENT_QUEUE_TAB.PENDING_DATA ? PAYMENT_QUEUE_STATUS.PAID : status,
    search: search.trim() || undefined,
    page: 1,
    limit: 20,
  });
  const pendingDataProofQueue = usePaymentQueue({ status: PAYMENT_QUEUE_STATUS.PAID, pending_proof: true, search: search.trim() || undefined, page: 1, limit: 100 });
  const pendingDataDetailsQueue = usePaymentQueue({ status: PAYMENT_QUEUE_STATUS.PAID, pending_details: true, search: search.trim() || undefined, page: 1, limit: 100 });
  const pendingQueue = usePaymentQueue({ status: PAYMENT_QUEUE_STATUS.PENDING, page: 1, limit: 100 });
  const paidQueue = usePaymentQueue({ status: PAYMENT_QUEUE_STATUS.PAID, page: 1, limit: 100 });
  const pendingDataRequests = Array.from(new Map([...pendingDataProofQueue.requests, ...pendingDataDetailsQueue.requests].map((request) => [request.id, request])).values());
  const displayedRequests = status === PAYMENT_QUEUE_TAB.PENDING_DATA ? pendingDataRequests : activeQueue.requests;
  const displayedError = status === PAYMENT_QUEUE_TAB.PENDING_DATA ? pendingDataProofQueue.error ?? pendingDataDetailsQueue.error : activeQueue.error;
  const displayedIsLoading = status === PAYMENT_QUEUE_TAB.PENDING_DATA ? pendingDataProofQueue.isLoading || pendingDataDetailsQueue.isLoading : activeQueue.isLoading;
  const pendingTotal = pendingQueue.requests.reduce((total, request) => total + getRequestPayableAmount(request), 0);
  const selectedRequests = displayedRequests.filter((request) => selectedRequestIds.includes(request.id));
  const selectedTotal = selectedRequests.reduce((total, request) => total + getRequestPayableAmount(request), 0);

  function openRegisterPayment(request: PaymentRequest) {
    setSelectedRequest(request);
    setIsModalOpen(true);
  }

  async function refreshAfterPayment() {
    await Promise.all([activeQueue.refetch(), pendingQueue.refetch(), paidQueue.refetch(), pendingDataProofQueue.refetch(), pendingDataDetailsQueue.refetch()]);
    toast.success("Pago registrado correctamente.");
  }

  async function refreshAfterBulkPayment() {
    await Promise.all([activeQueue.refetch(), pendingQueue.refetch(), paidQueue.refetch(), pendingDataProofQueue.refetch(), pendingDataDetailsQueue.refetch()]);
    setSelectedRequestIds([]);
    toast.success("Proceso de pagos actualizado.");
  }

  async function refreshAfterCompletion() {
    await Promise.all([activeQueue.refetch(), pendingQueue.refetch(), paidQueue.refetch(), pendingDataProofQueue.refetch(), pendingDataDetailsQueue.refetch()]);
    toast.success("Datos de pago actualizados.");
  }

  async function refreshAfterProofAssociation() {
    await Promise.all([activeQueue.refetch(), pendingQueue.refetch(), paidQueue.refetch(), pendingDataProofQueue.refetch(), pendingDataDetailsQueue.refetch()]);
    toast.success("Comprobante asociado a líneas POA.");
  }

  function setTab(nextStatus: PaymentQueueTab) {
    setStatus(nextStatus);
    setSelectedRequestIds([]);
  }

  function toggleRequest(requestId: string, checked: boolean) {
    setSelectedRequestIds((current) => checked ? Array.from(new Set([...current, requestId])) : current.filter((id) => id !== requestId));
  }

  function toggleAllVisible(checked: boolean) {
    const visibleApprovedIds = displayedRequests.filter((request) => request.status === REQUEST_STATUS.APPROVED).map((request) => request.id);
    setSelectedRequestIds((current) => checked
      ? Array.from(new Set([...current, ...visibleApprovedIds]))
      : current.filter((id) => !visibleApprovedIds.includes(id)));
  }

  function openCompletePaymentDetails(request: PaymentRequest) {
    setCompletionRequest(request);
    setIsCompletionModalOpen(true);
  }

  function openAttachPaymentProof(request: PaymentRequest) {
    setProofAssociationRequest(request);
    setIsAttachProofModalOpen(true);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cola de Pagos</h1>
        <p className="text-muted-foreground">Gestiona solicitudes en proceso de pago y consulta el historial pagado.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle>Pendientes</CardTitle><CardDescription>En gestión de pago</CardDescription></CardHeader>
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
        <Card>
          <CardHeader><CardTitle>Datos pendientes</CardTitle><CardDescription>Constancia o referencia por completar</CardDescription></CardHeader>
          <CardContent><p className="text-3xl font-bold">{pendingDataRequests.length}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Solicitudes para pago</CardTitle>
            <CardDescription>{status === REQUEST_STATUS.APPROVED ? "Solicitudes en gestión de transferencia." : status === PAYMENT_QUEUE_TAB.PENDING_DATA ? "Pagos con constancia o referencia pendiente." : "Pagos registrados."}</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-md border p-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setTab(PAYMENT_QUEUE_STATUS.PENDING)} className={cn(status === REQUEST_STATUS.APPROVED && "bg-primary text-primary-foreground hover:bg-primary/90")} data-testid="payment-filter-approved">Pendientes</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTab(PAYMENT_QUEUE_STATUS.PAID)} className={cn(status === REQUEST_STATUS.PAID && "bg-primary text-primary-foreground hover:bg-primary/90")} data-testid="payment-filter-paid">Historial pagado</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTab(PAYMENT_QUEUE_TAB.PENDING_DATA)} className={cn(status === PAYMENT_QUEUE_TAB.PENDING_DATA && "bg-primary text-primary-foreground hover:bg-primary/90")} data-testid="payment-filter-pending-data">Datos pendientes</Button>
            </div>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código o concepto..." className="sm:w-72" data-testid="payment-search-input" />
          </div>
        </CardHeader>
        <CardContent>
          {status === REQUEST_STATUS.APPROVED && selectedRequests.length > 0 && (
            <div className="mb-4 flex flex-col gap-3 rounded-md border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="bulk-payment-action-bar">
              <p className="text-sm">
                {selectedRequests.length} seleccionada{selectedRequests.length === 1 ? "" : "s"} · {formatRequestCurrency(selectedTotal)}. Los montos no se editan en el registro masivo.
              </p>
              <Button type="button" onClick={() => setIsBulkModalOpen(true)} data-testid="bulk-payment-open-button">Marcar como pagadas</Button>
            </div>
          )}
          {displayedError ? (
            <div className="space-y-3 rounded-md border border-destructive/40 p-4">
              <p className="text-sm text-destructive">{getApiErrorMessage(displayedError)}</p>
              <Button size="sm" variant="outline" onClick={() => void (status === PAYMENT_QUEUE_TAB.PENDING_DATA ? Promise.all([pendingDataProofQueue.refetch(), pendingDataDetailsQueue.refetch()]) : activeQueue.refetch())}>Reintentar</Button>
            </div>
          ) : (
            <PaymentQueueTable
              requests={displayedRequests}
              isLoading={displayedIsLoading}
              onRegisterPayment={openRegisterPayment}
              selectedRequestIds={selectedRequestIds}
              onToggleRequest={status === REQUEST_STATUS.APPROVED ? toggleRequest : undefined}
              onToggleAll={status === REQUEST_STATUS.APPROVED ? toggleAllVisible : undefined}
              onCompletePaymentDetails={openCompletePaymentDetails}
              onAttachPaymentProof={openAttachPaymentProof}
            />
          )}
        </CardContent>
      </Card>

      <RegisterPaymentModal request={selectedRequest} open={isModalOpen} onOpenChange={setIsModalOpen} onSuccess={refreshAfterPayment} />
      <BulkMarkPaidModal requests={selectedRequests} open={isBulkModalOpen} onOpenChange={setIsBulkModalOpen} onSuccess={refreshAfterBulkPayment} />
      <CompletePaymentDetailsModal request={completionRequest} open={isCompletionModalOpen} onOpenChange={setIsCompletionModalOpen} onSuccess={refreshAfterCompletion} />
      <AttachPaymentProofModal request={proofAssociationRequest} open={isAttachProofModalOpen} onOpenChange={setIsAttachProofModalOpen} onSuccess={refreshAfterProofAssociation} />
    </div>
  );
}
