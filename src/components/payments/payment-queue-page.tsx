"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePaymentQueue, useRetryRexanActivation } from "@/hooks/use-requests";
import { PAYMENT_QUEUE_STATUS, getApiErrorMessage, getPaymentRexanStatusLabel } from "@/lib/requests";
import { cn } from "@/lib/utils";
import { PAYMENT_COMPLETENESS, REQUEST_STATUS, type PaymentRequest, type RegisterPaymentResponse } from "@/types/requests";
import { useAuthStore } from "@/stores/auth-store";
import { PaymentQueueTable } from "./payment-queue-table";
import { RegisterPaymentModal } from "./register-payment-modal";
import { CompletePaymentDetailsModal } from "./complete-payment-details-modal";
import { GiofBulkAssignmentBar } from "@/components/giof-work/giof-work-controls";
import { useGiofWorkLeaseSet } from "@/hooks/use-giof-work";
import { useDriveProjectionPolling } from "@/hooks/use-drive-projection-polling";
import { canOperateAssignedGiofWork, canRetryGiofWork, isGiofManagerRole, isGiofOperationalRole } from "@/lib/role-capabilities";
import { GIOF_WORK_POOL, GIOF_WORK_SCOPE, type GiofWorkScope } from "@/types/giof-work";
import type { GiofWorkLease } from "@/types/giof-work";
import { isGiofLeaseCurrent } from "@/lib/giof-work-lease-session";
import { parsePaymentQueueUrl, PAYMENT_QUEUE_TAB, serializePaymentQueueUrl, updatePaymentQueueUrl, type PaymentQueueTab, type PaymentQueueUrlFilters } from "@/lib/queue-filters/payment";
import { QueueFilterReset } from "@/components/queue-filters/queue-filter-reset";
import { PaymentQueueFilters } from "./payment-queue-filters";

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
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  const [paymentOperationalContext, setPaymentOperationalContext] = useState<GiofWorkLease | null>(null);
  const [completionRequest, setCompletionRequest] = useState<PaymentRequest | null>(null);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);
  const parsedUrl = parsePaymentQueueUrl(new URLSearchParams(searchParams.toString()));
  const urlFilters = parsedUrl.filters;
  const tab = urlFilters.tab ?? PAYMENT_QUEUE_TAB.APPROVED;
  const roleFilterInvalid = isGiofManager
    ? false
    : canManagePayments
      ? Boolean(urlFilters.assignee_id || (urlFilters.work_scope && urlFilters.work_scope !== GIOF_WORK_SCOPE.MINE))
      : Boolean(urlFilters.work_scope || urlFilters.assignee_id);
  const hasInvalidUrl = parsedUrl.invalidKeys.length > 0 || parsedUrl.unknownKeys.length > 0 || roleFilterInvalid;
  const workScope: GiofWorkScope | undefined = canManagePayments
    ? isGiofManager ? urlFilters.work_scope ?? GIOF_WORK_SCOPE.ALL : GIOF_WORK_SCOPE.MINE
    : undefined;
  const workAssigneeId = isGiofManager && workScope === GIOF_WORK_SCOPE.ASSIGNEE ? urlFilters.assignee_id : undefined;
  const { tab: _tab, ...paymentUrlFilters } = urlFilters;
  const activeQueue = usePaymentQueue({
    ...paymentUrlFilters,
    status: tab === PAYMENT_QUEUE_TAB.APPROVED ? PAYMENT_QUEUE_STATUS.PENDING : PAYMENT_QUEUE_STATUS.PAID,
    completeness: tab === PAYMENT_QUEUE_TAB.PENDING_DATA ? PAYMENT_COMPLETENESS.ANY_MISSING : paymentUrlFilters.completeness,
    work_scope: workScope,
    assignee_id: workAssigneeId,
  }, { enabled: !hasInvalidUrl });
  const displayedRequests = activeQueue.requests;
  const displayedError = activeQueue.error;
  const displayedIsLoading = activeQueue.isLoading;
  const displayedIsRefreshing = activeQueue.isRefreshing;
  const displayedTotal = activeQueue.total;
  const displayedLimit = activeQueue.limit || 20;
  const page = activeQueue.page;
  const totalPages = Math.max(1, Math.ceil(displayedTotal / displayedLimit));
  const viewIdentity = serializePaymentQueueUrl({ ...urlFilters, work_scope: workScope, assignee_id: workAssigneeId }).toString();
  const hasVisiblePendingDriveProjection = displayedRequests.some((request) =>
    request.payment?.drive_projection_status === "PENDING"
    || request.payment?.drive_projection_status === "PROCESSING",
  );

  useDriveProjectionPolling({
    hasPendingProjection: hasVisiblePendingDriveProjection,
    refetch: () =>
      activeQueue.refetch({ force: true }),
  });

  useEffect(() => {
    setSelectedAssignmentIds([]);
  }, [viewIdentity]);

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
    await activeQueue.refetch();
    const notice = getPaymentRegisteredToast(result);
    toast.success(notice.title, { description: notice.description });
  }

  async function refreshAfterCompletion() {
    if (completionRequest) await leaseSet.release(completionRequest.id);
    await activeQueue.refetch();
    toast.success("Pago completado.");
  }

  function setTab(nextStatus: PaymentQueueTab) {
    changeFilters({ tab: nextStatus, completeness: undefined });
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
    await activeQueue.refetch();
    toast.success("REXAN programada para reintento.");
  }

  function replacePaymentUrl(params: URLSearchParams): void {
    const query = params.toString();
    if (query) router.replace(`/payments?${query}`);
    else router.replace("/payments");
  }

  function changeFilters(patch: Partial<PaymentQueueUrlFilters>): void {
    replacePaymentUrl(updatePaymentQueueUrl(new URLSearchParams(searchParams.toString()), patch));
  }

  function clearFilters(): void {
    replacePaymentUrl(serializePaymentQueueUrl({ tab }));
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Resultados</CardTitle><CardDescription>Resumen exacto de todos los filtros aplicados</CardDescription></CardHeader>
          <CardContent><p className="text-3xl font-bold">{activeQueue.summary?.count ?? displayedTotal}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Monto pagable filtrado</CardTitle><CardDescription>Saldo REXAN elegible o monto normal, agregado por moneda en servidor</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-4">{Object.entries(activeQueue.summary?.payable_amount_by_currency ?? {}).map(([currency, amount]) => <p key={currency} className="text-2xl font-bold"><span className="text-sm font-medium text-muted-foreground">{currency}</span> {amount}</p>)}{Object.keys(activeQueue.summary?.payable_amount_by_currency ?? {}).length === 0 ? <p className="text-2xl font-bold">—</p> : null}</CardContent>
        </Card>
      </div>

      {hasInvalidUrl ? (
        <QueueFilterReset message="No se pudieron aplicar los filtros de la URL. Restablécelos para continuar sin exponer parámetros inválidos." onReset={() => replacePaymentUrl(new URLSearchParams())} />
      ) : (
        <PaymentQueueFilters filters={{ ...urlFilters, work_scope: workScope, assignee_id: workAssigneeId }} isManager={isGiofManager} summary={activeQueue.summary} total={displayedTotal} isLoading={displayedIsLoading} isRefreshing={displayedIsRefreshing} onChange={changeFilters} onClear={clearFilters} />
      )}

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Solicitudes para pago</CardTitle>
            <CardDescription>{tab === PAYMENT_QUEUE_TAB.APPROVED ? "Solicitudes en gestión de transferencia." : tab === PAYMENT_QUEUE_TAB.PENDING_DATA ? "Pagos con constancia, referencia o cuenta pendiente." : "Pagos registrados."}</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-md border p-1" role="group" aria-label="Vista de pagos">
              <Button type="button" variant="ghost" size="sm" onClick={() => setTab(PAYMENT_QUEUE_TAB.APPROVED)} className={cn(tab === PAYMENT_QUEUE_TAB.APPROVED && "bg-primary text-primary-foreground hover:bg-primary/90")} data-testid="payment-filter-approved">Pendientes</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTab(PAYMENT_QUEUE_TAB.PAID)} className={cn(tab === PAYMENT_QUEUE_TAB.PAID && "bg-primary text-primary-foreground hover:bg-primary/90")} data-testid="payment-filter-paid">Historial pagado</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setTab(PAYMENT_QUEUE_TAB.PENDING_DATA)} className={cn(tab === PAYMENT_QUEUE_TAB.PENDING_DATA && "bg-primary text-primary-foreground hover:bg-primary/90")} data-testid="payment-filter-pending-data">Datos pendientes</Button>
            </div>
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
               <Button size="sm" variant="outline" onClick={() => void activeQueue.refetch()}>Reintentar</Button>
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
                <Button type="button" size="sm" variant="outline" disabled={page <= 1 || displayedIsLoading} onClick={() => changeFilters({ page: Math.max(1, page - 1) })}>Anterior</Button>
                <Button type="button" size="sm" variant="outline" disabled={page >= totalPages || displayedIsLoading} onClick={() => changeFilters({ page: Math.min(totalPages, page + 1) })}>Siguiente</Button>
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
