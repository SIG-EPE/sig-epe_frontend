"use client";

import { useEffect, useState } from "react";
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
import { CompletePaymentDetailsModal } from "./complete-payment-details-modal";
import { GiofBulkAssignmentBar, GiofWorkScopeFilter } from "@/components/giof-work/giof-work-controls";
import { useGiofWorkLeaseSet } from "@/hooks/use-giof-work";
import { useDriveProjectionPolling } from "@/hooks/use-drive-projection-polling";
import { canOperateAssignedGiofWork, canRetryGiofWork, isGiofManagerRole, isGiofOperationalRole } from "@/lib/role-capabilities";
import { GIOF_WORK_POOL, GIOF_WORK_SCOPE, type GiofWorkScope } from "@/types/giof-work";
import type { GiofWorkLease } from "@/types/giof-work";
import { isGiofLeaseCurrent } from "@/lib/giof-work-lease-session";
import { GIOF_HELP_CONTEXT } from "@/lib/giof-assignment-help";
import { REQUEST_PAYMENT_SELECTOR_STATUSES } from "@/lib/request-status-vocabulary";

const PAYMENT_QUEUE_TAB = {
  PENDING: REQUEST_PAYMENT_SELECTOR_STATUSES[0],
  PAID: REQUEST_PAYMENT_SELECTOR_STATUSES[1],
  PENDING_DATA: "pending-data",
} as const;

type PaymentQueueTab = (typeof PAYMENT_QUEUE_TAB)[keyof typeof PAYMENT_QUEUE_TAB];

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

export function PaymentQueuePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const roleCode = user?.role?.code;
  const isGiofManager = isGiofManagerRole(roleCode);
  const canManagePayments = isGiofOperationalRole(roleCode);
  const canRetryRexan = canRetryGiofWork(roleCode);
  const leaseSet = useGiofWorkLeaseSet();
  const { retryRexanActivation, isLoading: isRetryingRexan } = useRetryRexanActivation();
  const [status, setStatus] = useState<PaymentQueueTab>(PAYMENT_QUEUE_STATUS.PENDING);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  const [paymentOperationalContext, setPaymentOperationalContext] = useState<GiofWorkLease | null>(null);
  const [completionRequest, setCompletionRequest] = useState<PaymentRequest | null>(null);
  const [page, setPage] = useState(1);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const rawWorkScope = searchParams.get("work_scope");
  const workScope: GiofWorkScope = Object.values(GIOF_WORK_SCOPE).includes(rawWorkScope as GiofWorkScope) ? rawWorkScope as GiofWorkScope : isGiofManager ? GIOF_WORK_SCOPE.ALL : GIOF_WORK_SCOPE.MINE;
  const workAssigneeId = workScope === GIOF_WORK_SCOPE.ASSIGNEE ? searchParams.get("assignee_id") ?? undefined : undefined;
  const workFilters = { work_scope: workScope, assignee_id: isGiofManager ? workAssigneeId : undefined };
  const activeQueue = usePaymentQueue({
    status: status === PAYMENT_QUEUE_TAB.PENDING_DATA ? PAYMENT_QUEUE_STATUS.PAID : status,
    search: debouncedSearch || undefined,
    page,
    limit: 20,
    ...workFilters,
  });
  const pendingDataQueue = usePaymentQueue({ pending_data: true, search: debouncedSearch || undefined, page, limit: 20, ...workFilters });
  const pendingQueue = usePaymentQueue({ status: PAYMENT_QUEUE_STATUS.PENDING, page: 1, limit: 100, ...workFilters });
  const paidQueue = usePaymentQueue({ status: PAYMENT_QUEUE_STATUS.PAID, page: 1, limit: 100, ...workFilters });
  const displayedRequests = status === PAYMENT_QUEUE_TAB.PENDING_DATA ? pendingDataQueue.requests : activeQueue.requests;
  const displayedError = status === PAYMENT_QUEUE_TAB.PENDING_DATA ? pendingDataQueue.error : activeQueue.error;
  const displayedIsLoading = status === PAYMENT_QUEUE_TAB.PENDING_DATA ? pendingDataQueue.isLoading : activeQueue.isLoading;
  const displayedIsRefreshing = status === PAYMENT_QUEUE_TAB.PENDING_DATA ? pendingDataQueue.isRefreshing : activeQueue.isRefreshing;
  const pendingTotal = pendingQueue.requests.reduce((total, request) => total + getRequestPayableAmount(request), 0);
  const displayedTotal = status === PAYMENT_QUEUE_TAB.PENDING_DATA ? pendingDataQueue.total : activeQueue.total;
  const displayedLimit = (status === PAYMENT_QUEUE_TAB.PENDING_DATA ? pendingDataQueue.limit : activeQueue.limit) || 20;
  const totalPages = Math.max(1, Math.ceil(displayedTotal / displayedLimit));
  const hasVisiblePendingDriveProjection = displayedRequests.some((request) =>
    request.payment?.drive_projection_status === "PENDING"
    || request.payment?.drive_projection_status === "PROCESSING",
  );

  useDriveProjectionPolling({
    hasPendingProjection: hasVisiblePendingDriveProjection,
    refetch: () =>
      status === PAYMENT_QUEUE_TAB.PENDING_DATA
        ? pendingDataQueue.refetch({ force: true })
        : activeQueue.refetch({ force: true }),
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, workScope, workAssigneeId]);

  async function openRegisterPayment(request: PaymentRequest) {
    const work = request.giof_work;
    if (!work || work.pool !== GIOF_WORK_POOL.PAYMENT || !canOperateAssignedGiofWork(work, user?.id)) {
      toast.error("Este pago no tiene una asignación operativa vigente para tu usuario. Actualiza la cola.");
      return;
    }
    let context = paymentOperationalContext;
    if (!isGiofLeaseCurrent(context, { requestId: request.id, pool: GIOF_WORK_POOL.PAYMENT, assignmentVersion: work.assignmentVersion, ownerId: user?.id })) {
      try {
        context = await leaseSet.acquire(request.id, work, [request.payment?.id ?? ""]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Actualiza la cola antes de continuar.");
        await activeQueue.refetch();
        return;
      }
    }
    if (!isGiofLeaseCurrent(context, { requestId: request.id, pool: GIOF_WORK_POOL.PAYMENT, assignmentVersion: work.assignmentVersion, ownerId: user?.id })) {
      toast.error("No se pudo establecer una sesión PAYMENT vigente. Actualiza la cola y vuelve a intentar.");
      await leaseSet.release(request.id);
      await activeQueue.refetch();
      return;
    }
    setPaymentOperationalContext(context);
    setSelectedRequest(request);
    setIsModalOpen(true);
  }

  async function clearPaymentOperationalContext(refresh = false): Promise<void> {
    const requestId = selectedRequest?.id ?? paymentOperationalContext?.requestId;
    setPaymentOperationalContext(null);
    if (requestId) await leaseSet.release(requestId);
    if (refresh) await activeQueue.refetch();
  }

  async function refreshAfterPayment(result: RegisterPaymentResponse) {
    setPaymentOperationalContext(null);
    await leaseSet.release(result.request.id);
    await Promise.all([activeQueue.refetch(), pendingQueue.refetch(), paidQueue.refetch(), pendingDataQueue.refetch()]);
    const notice = getPaymentRegisteredToast(result);
    toast.success(notice.title, { description: notice.description });
  }

  async function refreshAfterCompletion() {
    if (completionRequest) await leaseSet.release(completionRequest.id);
    await Promise.all([activeQueue.refetch(), pendingQueue.refetch(), paidQueue.refetch(), pendingDataQueue.refetch()]);
    toast.success("Pago completado.");
  }

  function setTab(nextStatus: PaymentQueueTab) {
    setStatus(nextStatus);
    setPage(1);
  }

  async function openCompletePaymentDetails(request: PaymentRequest) {
    if (request.giof_work) {
      if (!canOperateAssignedGiofWork(request.giof_work, user?.id)) return;
      try { await leaseSet.acquire(request.id, request.giof_work, [request.payment?.id ?? request.payment_id ?? ""]); } catch (error) { toast.error(error instanceof Error ? error.message : "Actualiza la cola."); return; }
    }
    setCompletionRequest(request);
    setIsCompletionModalOpen(true);
  }

  async function retryRexan(request: PaymentRequest) {
    if (!canRetryRexan || isRetryingRexan) return;
    if (request.giof_work) {
      if (!canOperateAssignedGiofWork(request.giof_work, user?.id)) return;
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
    void leaseSet.releaseAll();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cola de Pagos</h1>
        <p className="text-muted-foreground">Gestiona solicitudes en proceso de pago y consulta el historial pagado.</p>
        {canManagePayments ? (
          <p className="mt-1 text-sm text-muted-foreground">
            El pago individual registra por separado la fecha efectiva, la fecha de destino y el momento de clasificación en SIG-EPE.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader><CardTitle>Pendientes</CardTitle><CardDescription>Pendiente de pago</CardDescription></CardHeader>
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
          <CardContent><p className="text-3xl font-bold">{pendingDataQueue.total}</p></CardContent>
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
            <div className="inline-flex rounded-md border p-1" role="group" aria-label="Vista de pagos">
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
          {displayedError ? (
            <div className="space-y-3 rounded-md border border-destructive/40 p-4">
              <p className="text-sm text-destructive">{getApiErrorMessage(displayedError)}</p>
               <Button size="sm" variant="outline" onClick={() => void (status === PAYMENT_QUEUE_TAB.PENDING_DATA ? pendingDataQueue.refetch() : activeQueue.refetch())}>Reintentar</Button>
            </div>
          ) : (
            <PaymentQueueTable
              requests={displayedRequests}
              isLoading={displayedIsLoading}
              onRegisterPayment={openRegisterPayment}
              onCompletePaymentDetails={openCompletePaymentDetails}
              onRetryRexanActivation={canRetryRexan ? retryRexan : undefined}
              currentUserId={user?.id}
              isGiofManager={isGiofManager}
              canManagePayments={canManagePayments}
              paymentLeases={leaseSet.leases}
              selectedAssignmentIds={selectedAssignmentIds}
              onToggleAssignment={(requestId, checked) => setSelectedAssignmentIds((current) => checked ? [...new Set([...current, requestId])].slice(0, 50) : current.filter((id) => id !== requestId))}
              onToggleAllAssignments={(checked) => setSelectedAssignmentIds(checked ? displayedRequests.filter((request) => request.giof_work?.canAssign === true).map((request) => request.id).slice(0, 50) : [])}
            />
          )}
          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between" aria-label="Paginación de pagos">
              <p className="text-sm text-muted-foreground">Página {page} de {totalPages}. Total: {displayedTotal}</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={page <= 1 || displayedIsLoading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</Button>
                <Button type="button" size="sm" variant="outline" disabled={page >= totalPages || displayedIsLoading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Siguiente</Button>
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
      <CompletePaymentDetailsModal request={completionRequest} open={isCompletionModalOpen} onOpenChange={(open) => { setIsCompletionModalOpen(open); if (!open && completionRequest) void leaseSet.release(completionRequest.id); }} onSuccess={refreshAfterCompletion} />
    </div>
  );
}
