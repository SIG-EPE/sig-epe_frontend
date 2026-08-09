"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaymentQueue, useRetryRexanActivation } from "@/hooks/use-requests";
import { PAYMENT_QUEUE_STATUS, formatRequestCurrency, getApiErrorMessage, getPaymentRexanStatusLabel, getRequestPayableAmount } from "@/lib/requests";
import { cn } from "@/lib/utils";
import { REQUEST_STATUS, type PaymentRequest, type RegisterPaymentResponse } from "@/types/requests";
import { useAuthStore } from "@/stores/auth-store";
import { PaymentQueueTable } from "./payment-queue-table";
import { RegisterPaymentModal } from "./register-payment-modal";
import { BulkMarkPaidModal } from "./bulk-mark-paid-modal";
import { CompletePaymentDetailsModal } from "./complete-payment-details-modal";
import { AttachPaymentProofModal } from "./attach-payment-proof-modal";
import { GiofBulkAssignmentBar, GiofWorkScopeFilter } from "@/components/giof-work/giof-work-controls";
import { useGiofWorkLeaseSet } from "@/hooks/use-giof-work";
import { isGiofManagerRole, isGiofOperationalRole } from "@/lib/role-capabilities";
import { GIOF_WORK_POOL, GIOF_WORK_SCOPE, type GiofWorkScope } from "@/types/giof-work";
import { GIOF_HELP_CONTEXT } from "@/lib/giof-assignment-help";

const PAYMENT_QUEUE_TAB = {
  PENDING: REQUEST_STATUS.APPROVED,
  PAID: REQUEST_STATUS.PAID,
  PENDING_DATA: "pending-data",
} as const;

type PaymentQueueTab = (typeof PAYMENT_QUEUE_TAB)[keyof typeof PAYMENT_QUEUE_TAB];

export function PaymentQueuePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const roleCode = user?.role?.code;
  const isGiofManager = isGiofManagerRole(roleCode);
  const canRetryRexan = isGiofOperationalRole(roleCode);
  const leaseSet = useGiofWorkLeaseSet();
  const { retryRexanActivation, isLoading: isRetryingRexan } = useRetryRexanActivation();
  const [status, setStatus] = useState<PaymentQueueTab>(PAYMENT_QUEUE_STATUS.PENDING);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  const [completionRequest, setCompletionRequest] = useState<PaymentRequest | null>(null);
  const [proofAssociationRequest, setProofAssociationRequest] = useState<PaymentRequest | null>(null);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const [isAttachProofModalOpen, setIsAttachProofModalOpen] = useState(false);
  const rawWorkScope = searchParams.get("work_scope");
  const workScope: GiofWorkScope = Object.values(GIOF_WORK_SCOPE).includes(rawWorkScope as GiofWorkScope) ? rawWorkScope as GiofWorkScope : GIOF_WORK_SCOPE.MINE;
  const workAssigneeId = workScope === GIOF_WORK_SCOPE.ASSIGNEE ? searchParams.get("assignee_id") ?? undefined : undefined;
  const workFilters = { work_scope: workScope, assignee_id: isGiofManager ? workAssigneeId : undefined };
  const activeQueue = usePaymentQueue({
    status: status === PAYMENT_QUEUE_TAB.PENDING_DATA ? PAYMENT_QUEUE_STATUS.PAID : status,
    search: debouncedSearch || undefined,
    page: 1,
    limit: 20,
    ...workFilters,
  });
  const pendingDataProofQueue = usePaymentQueue({ status: PAYMENT_QUEUE_STATUS.PAID, pending_proof: true, search: debouncedSearch || undefined, page: 1, limit: 100, ...workFilters });
  const pendingDataDetailsQueue = usePaymentQueue({ status: PAYMENT_QUEUE_STATUS.PAID, pending_details: true, search: debouncedSearch || undefined, page: 1, limit: 100, ...workFilters });
  const pendingQueue = usePaymentQueue({ status: PAYMENT_QUEUE_STATUS.PENDING, page: 1, limit: 100, ...workFilters });
  const paidQueue = usePaymentQueue({ status: PAYMENT_QUEUE_STATUS.PAID, page: 1, limit: 100, ...workFilters });
  const pendingDataRequests = Array.from(new Map([...pendingDataProofQueue.requests, ...pendingDataDetailsQueue.requests].map((request) => [request.id, request])).values());
  const displayedRequests = status === PAYMENT_QUEUE_TAB.PENDING_DATA ? pendingDataRequests : activeQueue.requests;
  const displayedError = status === PAYMENT_QUEUE_TAB.PENDING_DATA ? pendingDataProofQueue.error ?? pendingDataDetailsQueue.error : activeQueue.error;
  const displayedIsLoading = status === PAYMENT_QUEUE_TAB.PENDING_DATA ? pendingDataProofQueue.isLoading || pendingDataDetailsQueue.isLoading : activeQueue.isLoading;
  const displayedIsRefreshing = status === PAYMENT_QUEUE_TAB.PENDING_DATA ? pendingDataProofQueue.isRefreshing || pendingDataDetailsQueue.isRefreshing : activeQueue.isRefreshing;
  const pendingTotal = pendingQueue.requests.reduce((total, request) => total + getRequestPayableAmount(request), 0);
  const selectedRequests = displayedRequests.filter((request) => selectedRequestIds.includes(request.id));
  const selectedTotal = selectedRequests.reduce((total, request) => total + getRequestPayableAmount(request), 0);

  async function openRegisterPayment(request: PaymentRequest) {
    if (request.giof_work) {
      if (!request.giof_work.canAcquire) return;
      try {
        await leaseSet.acquire(request.id, request.giof_work, [request.payment?.id ?? ""]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Actualiza la cola antes de continuar.");
        await activeQueue.refetch();
        return;
      }
    }
    setSelectedRequest(request);
    setIsModalOpen(true);
  }

  async function refreshAfterPayment(result: RegisterPaymentResponse) {
    await leaseSet.release(result.request.id);
    await Promise.all([activeQueue.refetch(), pendingQueue.refetch(), paidQueue.refetch(), pendingDataProofQueue.refetch(), pendingDataDetailsQueue.refetch()]);
    toast.success(`Pago registrado. ${getPaymentRexanStatusLabel(result.rexan_activation.status)}.`);
  }

  async function refreshAfterBulkPayment() {
    await leaseSet.releaseAll();
    await Promise.all([activeQueue.refetch(), pendingQueue.refetch(), paidQueue.refetch(), pendingDataProofQueue.refetch(), pendingDataDetailsQueue.refetch()]);
    setSelectedRequestIds([]);
    toast.success("Proceso de pagos actualizado.");
  }

  async function refreshAfterCompletion() {
    if (completionRequest) await leaseSet.release(completionRequest.id);
    await Promise.all([activeQueue.refetch(), pendingQueue.refetch(), paidQueue.refetch(), pendingDataProofQueue.refetch(), pendingDataDetailsQueue.refetch()]);
    toast.success("Datos de pago actualizados.");
  }

  async function refreshAfterProofAssociation() {
    if (proofAssociationRequest) await leaseSet.release(proofAssociationRequest.id);
    await Promise.all([activeQueue.refetch(), pendingQueue.refetch(), paidQueue.refetch(), pendingDataProofQueue.refetch(), pendingDataDetailsQueue.refetch()]);
    toast.success("Comprobante asociado a líneas POA.");
  }

  function setTab(nextStatus: PaymentQueueTab) {
    setStatus(nextStatus);
    setSelectedRequestIds([]);
  }

  async function toggleRequest(requestId: string, checked: boolean) {
    const request = displayedRequests.find((candidate) => candidate.id === requestId);
    if (checked && request?.giof_work) {
      if (!request.giof_work.canAcquire) return;
      try {
        await leaseSet.acquire(request.id, request.giof_work, [request.payment?.id ?? ""]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Actualiza la cola antes de continuar.");
        await activeQueue.refetch();
        return;
      }
    }
    if (!checked) await leaseSet.release(requestId);
    setSelectedRequestIds((current) => checked ? Array.from(new Set([...current, requestId])) : current.filter((id) => id !== requestId));
  }

  async function toggleAllVisible(checked: boolean) {
    const visibleApproved = displayedRequests.filter((request) => request.status === REQUEST_STATUS.APPROVED && request.giof_work?.canAcquire);
    const visibleApprovedIds = visibleApproved.map((request) => request.id);
    if (checked) {
      try {
        for (const request of visibleApproved) await leaseSet.acquire(request.id, request.giof_work!, [request.payment?.id ?? ""]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudieron abrir todos los trabajos.");
        await leaseSet.releaseAll();
        return;
      }
    } else await leaseSet.releaseAll();
    setSelectedRequestIds((current) => checked
      ? Array.from(new Set([...current, ...visibleApprovedIds]))
      : current.filter((id) => !visibleApprovedIds.includes(id)));
  }

  async function openCompletePaymentDetails(request: PaymentRequest) {
    if (request.giof_work) {
      if (!request.giof_work.canAcquire) return;
      try { await leaseSet.acquire(request.id, request.giof_work, [request.payment?.id ?? request.payment_id ?? ""]); } catch (error) { toast.error(error instanceof Error ? error.message : "Actualiza la cola."); return; }
    }
    setCompletionRequest(request);
    setIsCompletionModalOpen(true);
  }

  async function openAttachPaymentProof(request: PaymentRequest) {
    if (request.giof_work) {
      if (!request.giof_work.canAcquire) return;
      try { await leaseSet.acquire(request.id, request.giof_work, [request.payment?.id ?? request.payment_id ?? ""]); } catch (error) { toast.error(error instanceof Error ? error.message : "Actualiza la cola."); return; }
    }
    setProofAssociationRequest(request);
    setIsAttachProofModalOpen(true);
  }

  async function retryRexan(request: PaymentRequest) {
    if (!canRetryRexan || isRetryingRexan) return;
    if (request.giof_work) {
      if (!request.giof_work.canAcquire) return;
      try { await leaseSet.acquire(request.id, request.giof_work); } catch (error) { toast.error(error instanceof Error ? error.message : "Actualiza la cola."); return; }
    }
    await retryRexanActivation(request.id);
    await leaseSet.release(request.id);
    await Promise.all([activeQueue.refetch(), paidQueue.refetch()]);
    toast.success("REXAN programada para reintento.");
  }

  function setWorkScope(nextScope: GiofWorkScope, assigneeId?: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("work_scope", nextScope);
    if (nextScope === GIOF_WORK_SCOPE.ASSIGNEE && assigneeId) params.set("assignee_id", assigneeId); else params.delete("assignee_id");
    router.replace(`/payments?${params.toString()}`);
    setSelectedAssignmentIds([]);
    setSelectedRequestIds([]);
    void leaseSet.releaseAll();
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
            <GiofWorkScopeFilter value={workScope} assigneeId={workAssigneeId} isManager={isGiofManager} onChange={setWorkScope} helpContext={GIOF_HELP_CONTEXT.PAYMENT} />
            <div className="inline-flex rounded-md border p-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setTab(PAYMENT_QUEUE_STATUS.PENDING)} className={cn(status === REQUEST_STATUS.APPROVED && "bg-primary text-primary-foreground hover:bg-primary/90")} data-testid="payment-filter-approved">Pendientes</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTab(PAYMENT_QUEUE_STATUS.PAID)} className={cn(status === REQUEST_STATUS.PAID && "bg-primary text-primary-foreground hover:bg-primary/90")} data-testid="payment-filter-paid">Historial pagado</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTab(PAYMENT_QUEUE_TAB.PENDING_DATA)} className={cn(status === PAYMENT_QUEUE_TAB.PENDING_DATA && "bg-primary text-primary-foreground hover:bg-primary/90")} data-testid="payment-filter-pending-data">Datos pendientes</Button>
            </div>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código o concepto..." className="sm:w-72" data-testid="payment-search-input" />
          </div>
        </CardHeader>
        <CardContent>
          {isGiofManager && <GiofBulkAssignmentBar pool={GIOF_WORK_POOL.PAYMENT} items={displayedRequests.filter((request) => selectedAssignmentIds.includes(request.id) && request.giof_work?.canAssign === true).map((request) => ({ requestId: request.id, label: request.request_code ?? "Pago", work: request.giof_work! }))} onClear={() => setSelectedAssignmentIds([])} onSuccess={() => activeQueue.refetch()} />}
          {displayedIsRefreshing && !displayedError && (
            <p className="mb-3 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">
              Actualizando cola de pagos...
            </p>
          )}
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
              onRetryRexanActivation={canRetryRexan ? retryRexan : undefined}
              currentUserId={user?.id}
              isGiofManager={isGiofManager}
              selectedAssignmentIds={selectedAssignmentIds}
              onToggleAssignment={(requestId, checked) => setSelectedAssignmentIds((current) => checked ? [...new Set([...current, requestId])].slice(0, 50) : current.filter((id) => id !== requestId))}
              onToggleAllAssignments={(checked) => setSelectedAssignmentIds(checked ? displayedRequests.filter((request) => request.giof_work?.canAssign === true).map((request) => request.id).slice(0, 50) : [])}
            />
          )}
        </CardContent>
      </Card>

      <RegisterPaymentModal request={selectedRequest} open={isModalOpen} onOpenChange={(open) => { setIsModalOpen(open); if (!open && selectedRequest) void leaseSet.release(selectedRequest.id); }} onSuccess={refreshAfterPayment} />
      <BulkMarkPaidModal requests={selectedRequests} open={isBulkModalOpen} onOpenChange={setIsBulkModalOpen} onSuccess={refreshAfterBulkPayment} />
      <CompletePaymentDetailsModal request={completionRequest} open={isCompletionModalOpen} onOpenChange={(open) => { setIsCompletionModalOpen(open); if (!open && completionRequest) void leaseSet.release(completionRequest.id); }} onSuccess={refreshAfterCompletion} />
      <AttachPaymentProofModal request={proofAssociationRequest} open={isAttachProofModalOpen} onOpenChange={(open) => { setIsAttachProofModalOpen(open); if (!open && proofAssociationRequest) void leaseSet.release(proofAssociationRequest.id); }} onSuccess={refreshAfterProofAssociation} />
    </div>
  );
}
