"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApproveRequest, useObserveRequest, useRejectRequest, useRequest, useStartAdvanceSettlement } from "@/hooks/use-requests";
import { ROUTES } from "@/lib/constants";
import {
  canCorrectObservedRequest,
  canEditDraftRequest,
  canReviewRequest,
  formatRequestCurrency,
  formatRequestDate,
  getAdvanceSettlementCta,
  getApiErrorMessage,
  getPaymentRequestRenditionStatus,
  getRequestDisplayCode,
  getPlanningLineDisplay,
  getRenditionStatusLabel,
  getRequestMonthLabel,
  getRequestObserverName,
  REQUEST_TYPE_LABELS,
} from "@/lib/requests";
import { useAuthStore } from "@/stores/auth-store";
import { ADVANCE_SETTLEMENT_CTA_STATE } from "@/types/requests";
import { RequestStatusStepper } from "./request-status-stepper";
import { RequestDocumentsCard } from "./request-documents-card";
import { StatusBadge } from "./status-badge";

export function RequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { request, isLoading, error, refetch } = useRequest(params.id);
  const user = useAuthStore((state) => state.user);
  const roleCode = user?.role?.code;
  const [observeOpen, setObserveOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [observeComment, setObserveComment] = useState("");
  const [fieldReference, setFieldReference] = useState("");
  const [approveComment, setApproveComment] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const { observeRequest, isLoading: observing } = useObserveRequest();
  const { approveRequest, isLoading: approving } = useApproveRequest();
  const { rejectRequest, isLoading: rejecting } = useRejectRequest();
  const { startAdvanceSettlement, isLoading: startingSettlement } = useStartAdvanceSettlement();

  if (isLoading) {
    return <p className="rounded-md border p-6 text-sm text-muted-foreground">Cargando solicitud...</p>;
  }

  if (error || !request) {
    return (
      <div className="space-y-4 rounded-md border border-destructive/40 p-6">
        <p className="text-sm text-destructive">{error?.message ?? "No se encontró la solicitud."}</p>
        <Button variant="outline" onClick={() => void refetch()}>Reintentar</Button>
      </div>
    );
  }

  const openObservations = (request.observations ?? []).filter((observation) => !observation.is_resolved);
  const allObservations = request.observations ?? [];
  const canReview = canReviewRequest(roleCode, request.status);
  const canCorrect = canCorrectObservedRequest(roleCode, request.status);
  const canEditDraft = canEditDraftRequest(roleCode, request.status);
  const advanceSettlementCta = getAdvanceSettlementCta(roleCode, request, user?.id);
  const renditionStatus = getPaymentRequestRenditionStatus(request);
  const editHref = `${ROUTES.REQUESTS}/${request.id}/edit`;

  async function handleObserve(): Promise<void> {
    if (!request) return;
    const comment = observeComment.trim();
    if (!comment) {
      toast.error("Ingresa un comentario para observar la solicitud.");
      return;
    }
    try {
      await observeRequest(request.id, {
        comment,
        field_reference: fieldReference.trim() || undefined,
      });
      toast.success("Solicitud observada correctamente");
      setObserveOpen(false);
      setObserveComment("");
      setFieldReference("");
      await refetch();
    } catch (reviewError) {
      toast.error(getApiErrorMessage(reviewError));
    }
  }

  async function handleApprove(): Promise<void> {
    if (!request) return;
    try {
      await approveRequest(request.id, { comment: approveComment.trim() || undefined });
      toast.success("Solicitud aprobada correctamente");
      setApproveOpen(false);
      setApproveComment("");
      await refetch();
    } catch (reviewError) {
      toast.error(getApiErrorMessage(reviewError));
    }
  }

  async function handleReject(): Promise<void> {
    if (!request) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast.error("Ingresa el motivo del rechazo.");
      return;
    }
    try {
      await rejectRequest(request.id, { reason });
      toast.success("Solicitud rechazada correctamente");
      setRejectOpen(false);
      setRejectReason("");
      await refetch();
    } catch (reviewError) {
      toast.error(getApiErrorMessage(reviewError));
    }
  }

  async function handleStartSettlement(): Promise<void> {
    if (!request) return;
    try {
      const settlement = await startAdvanceSettlement(request.id);
      toast.success("Rendición iniciada correctamente");
      router.push(`${ROUTES.REQUESTS}/${settlement.id}/edit?step=documents` as Parameters<typeof router.push>[0]);
    } catch (settlementError) {
      toast.error(getApiErrorMessage(settlementError));
      await refetch();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{request.request_code ?? request.sequential_number ?? "Solicitud"}</h1>
          <p className="text-muted-foreground">Detalle y estado de la solicitud.</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={request.status} />
          <Button variant="outline" onClick={() => router.push(ROUTES.REQUESTS)}>Volver</Button>
        </div>
      </div>

      {canEditDraft && (
        <Card>
          <CardHeader><CardTitle>Borrador editable</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Esta solicitud todavía no fue enviada. Puedes continuar editando el borrador.</p>
            <Button onClick={() => router.push(editHref as Parameters<typeof router.push>[0])}>Editar borrador</Button>
          </CardContent>
        </Card>
      )}

      {openObservations.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/20">
          <AlertDescription className="space-y-3 text-amber-950 dark:text-amber-100">
            <div>
              <p className="font-medium">Solicitud observada</p>
              <p>Revisa los comentarios del revisor y corrige la información solicitada.</p>
            </div>
            <ul className="list-disc space-y-1 pl-5">
              {openObservations.map((observation) => (
                <li key={observation.id}>{observation.comment}</li>
              ))}
            </ul>
            {canCorrect && (
              <Button onClick={() => router.push(editHref as Parameters<typeof router.push>[0])}>
                Corregir solicitud
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {canReview && (
        <Card>
          <CardHeader><CardTitle>Acciones de revisión</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" onClick={() => setObserveOpen(true)}>Observar</Button>
            <Button onClick={() => setApproveOpen(true)}>Aprobar</Button>
            <Button variant="destructive" onClick={() => setRejectOpen(true)}>Rechazar</Button>
          </CardContent>
        </Card>
      )}

      {advanceSettlementCta && (
        <Card>
          <CardHeader><CardTitle>Rendición de anticipo</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Estado de rendición</p>
                <p className="font-medium">{renditionStatus ? getRenditionStatusLabel(renditionStatus) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fecha límite de rendición</p>
                <p className="font-medium">{formatRequestDate(request.scheduled_rendition_at)}</p>
              </div>
              <p className="text-muted-foreground sm:col-span-2">{advanceSettlementCta.description}</p>
            </div>
            {advanceSettlementCta.href ? (
              <Button
                variant={advanceSettlementCta.state === ADVANCE_SETTLEMENT_CTA_STATE.COMPLETED ? "outline" : "default"}
                onClick={() => router.push(advanceSettlementCta.href as Parameters<typeof router.push>[0])}
              >
                {advanceSettlementCta.label}
              </Button>
            ) : (
              <Button onClick={() => void handleStartSettlement()} disabled={startingSettlement}>
                {startingSettlement ? "Iniciando..." : advanceSettlementCta.label}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <RequestStatusStepper request={request} />

      {(request.relatedRequest || (request.advanceSettlements?.length ?? 0) > 0) && (
        <Card>
          <CardHeader><CardTitle>Solicitudes relacionadas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {request.relatedRequest && (
              <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Anticipo original</p>
                  <p className="text-sm text-muted-foreground">{getRequestDisplayCode(request.relatedRequest)} · {formatRequestCurrency(Number(request.relatedRequest.requested_amount), request.relatedRequest.currency)}</p>
                </div>
                <Button variant="outline" onClick={() => router.push(`${ROUTES.REQUESTS}/${request.relatedRequest?.id}` as Parameters<typeof router.push>[0])}>Ver anticipo</Button>
              </div>
            )}
            {request.advanceSettlements?.map((settlement) => (
              <div key={settlement.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Rendición vinculada</p>
                  <p className="text-sm text-muted-foreground">{getRequestDisplayCode(settlement)} · {formatRequestCurrency(Number(settlement.requested_amount), settlement.currency)}</p>
                </div>
                <Button variant="outline" onClick={() => router.push(`${ROUTES.REQUESTS}/${settlement.id}` as Parameters<typeof router.push>[0])}>Ver rendición</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <RequestDocumentsCard request={request} />

      <Card>
        <CardHeader><CardTitle>Datos principales</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Tipo</p><p className="font-medium">{REQUEST_TYPE_LABELS[request.request_type]}</p></div>
          <div><p className="text-xs text-muted-foreground">Monto</p><p className="font-medium">{formatRequestCurrency(Number(request.requested_amount), request.currency)}</p></div>
          <div><p className="text-xs text-muted-foreground">Mes</p><p className="font-medium">{getRequestMonthLabel(request.budget_month)}</p></div>
          <div><p className="text-xs text-muted-foreground">Fecha de creación</p><p className="font-medium">{formatRequestDate(request.created_at)}</p></div>
          <div className="md:col-span-2"><p className="text-xs text-muted-foreground">Línea POA</p><p className="font-medium">{getPlanningLineDisplay(request.budgetPlanningLine)}</p></div>
          <div className="md:col-span-2"><p className="text-xs text-muted-foreground">Concepto</p><p className="font-medium">{request.concept}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Beneficiario y proveedor</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Beneficiario</p><p className="font-medium">{request.beneficiary_name ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Banco</p><p className="font-medium">{request.bank_name ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Cuenta</p><p className="font-medium">{request.bank_account ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">CCI</p><p className="font-medium">{request.bank_cci ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Proveedor</p><p className="font-medium">{request.supplier_name ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">RUC proveedor</p><p className="font-medium">{request.supplier_ruc ?? "—"}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Observaciones</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {allObservations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin observaciones registradas.</p>
          ) : (
            allObservations.map((observation) => (
              <div key={observation.id} className="rounded-md border p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium">
                    {observation.is_resolved ? "Observación resuelta" : "Observación pendiente"}
                  </p>
                  <span className="text-xs text-muted-foreground">{formatRequestDate(observation.created_at)}</span>
                </div>
                <p className="mt-2 text-sm">{observation.comment}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Campo: {observation.field_reference ?? "General"}</span>
                  <span>Revisor: {getRequestObserverName(observation.observer)}</span>
                  {observation.resolved_at && <span>Resuelta: {formatRequestDate(observation.resolved_at)}</span>}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Historial de estados</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(request.statusHistory ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin historial disponible.</p>
          ) : (
            request.statusHistory?.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <StatusBadge status={item.to_status} />
                  <span className="text-xs text-muted-foreground">{formatRequestDate(item.created_at)}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.comment ?? item.reason ?? "Cambio de estado"}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={observeOpen} onOpenChange={setObserveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Observar solicitud</DialogTitle>
            <DialogDescription>Indica qué debe corregir el solicitante antes de reenviar la solicitud.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="field-reference">Campo relacionado</label>
              <Input id="field-reference" value={fieldReference} onChange={(event) => setFieldReference(event.target.value)} placeholder="Ej. cuenta bancaria, proveedor, concepto" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="observe-comment">Comentario *</label>
              <Textarea id="observe-comment" value={observeComment} onChange={(event) => setObserveComment(event.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setObserveOpen(false)} disabled={observing}>Cancelar</Button>
            <Button type="button" onClick={() => void handleObserve()} disabled={observing}>{observing ? "Registrando..." : "Registrar observación"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprobar solicitud</DialogTitle>
            <DialogDescription>Confirma que la solicitud fue revisada y puede continuar el proceso.</DialogDescription>
          </DialogHeader>
          <Textarea value={approveComment} onChange={(event) => setApproveComment(event.target.value)} rows={3} placeholder="Comentario opcional" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setApproveOpen(false)} disabled={approving}>Cancelar</Button>
            <Button type="button" onClick={() => void handleApprove()} disabled={approving}>{approving ? "Aprobando..." : "Aprobar solicitud"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar solicitud</DialogTitle>
            <DialogDescription>El rechazo cierra la revisión de esta solicitud. Ingresa un motivo claro.</DialogDescription>
          </DialogHeader>
          <Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={4} placeholder="Motivo del rechazo *" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)} disabled={rejecting}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={() => void handleReject()} disabled={rejecting}>{rejecting ? "Rechazando..." : "Rechazar solicitud"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
