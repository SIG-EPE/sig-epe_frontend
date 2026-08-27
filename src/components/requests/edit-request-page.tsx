"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRequest, useSettlementContext } from "@/hooks/use-requests";
import { ROUTES } from "@/lib/constants";
import { getRequestEditStep, REQUEST_EDIT_STEP } from "@/lib/requests";
import { REQUEST_STATUS, REQUEST_TYPE } from "@/types/requests";
import { useAuthStore } from "@/stores/auth-store";
import { canEditAssignedGiofWork, isGiofOperationalRole } from "@/lib/role-capabilities";
import { RequestForm } from "./request-form";

export function EditRequestPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { request, isInitialLoading, isRefreshing, error, refetch } = useRequest(params.id);
  const user = useAuthStore((state) => state.user);
  const isSettlement = request?.request_type === REQUEST_TYPE.ADVANCE_SETTLEMENT;
  const settlementContext = useSettlementContext(params.id, Boolean(isSettlement));

  if (!request && isInitialLoading) {
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

  const isDraft = request.status === REQUEST_STATUS.DRAFT;
  const isObserved = request.status === REQUEST_STATUS.OBSERVED;
  const activeStep = getRequestEditStep(searchParams.get("step"));
  const isOwner = request.requester_id === user?.id;
  const isAuthorizedGiofEditor = isGiofOperationalRole(user?.role?.code)
    && canEditAssignedGiofWork(request.giof_work, user?.id);

  if (!isOwner && isGiofOperationalRole(user?.role?.code) && !isAuthorizedGiofEditor) {
    return (
      <div className="space-y-4 rounded-md border p-6">
        <div>
          <h1 className="text-xl font-semibold">Solicitud disponible en solo lectura</h1>
          <p className="text-sm text-muted-foreground">Debes ser el responsable asignado y mantener un bloqueo activo para editar este trabajo.</p>
        </div>
        <Button variant="outline" onClick={() => router.replace(`${ROUTES.REQUESTS}/${request.id}`)}>Volver al detalle</Button>
      </div>
    );
  }

  if (!isDraft && !isObserved) {
    return (
      <div className="space-y-4 rounded-md border p-6">
        <div>
          <h1 className="text-xl font-semibold">La solicitud no puede editarse</h1>
          <p className="text-sm text-muted-foreground">Solo los borradores y las solicitudes observadas pueden editarse desde este flujo.</p>
        </div>
        <Button variant="outline" onClick={() => router.push(`${ROUTES.REQUESTS}/${request.id}`)}>Volver al detalle</Button>
      </div>
    );
  }

  const openObservations = (request.observations ?? []).filter((observation) => !observation.is_resolved);
  const originalAdvanceCode = settlementContext.context?.original_advance.request_code
    ?? settlementContext.context?.original_advance.sequential_number
    ?? request.relatedRequest?.request_code
    ?? request.relatedRequest?.sequential_number
    ?? request.related_request_id;
  const pageTitle = isSettlement
    ? activeStep === REQUEST_EDIT_STEP.REVIEW ? "Revisar rendición de anticipo" : "Preparar rendición de anticipo"
    : activeStep === REQUEST_EDIT_STEP.REVIEW
    ? isDraft ? "Revisar borrador antes del envío" : "Revisar corrección antes del envío"
    : isDraft ? "Editar borrador" : "Corregir solicitud";
  const pageSubtitle = isSettlement
    ? originalAdvanceCode
      ? `Rinde el anticipo ${originalAdvanceCode} con sus sustentos y revisa el resumen antes de enviarlo.`
      : "Rinde el anticipo pagado con sus sustentos y revisa el resumen antes de enviarlo."
    : activeStep === REQUEST_EDIT_STEP.REVIEW
    ? isDraft
      ? "Verifica la información y los documentos antes de enviar la solicitud a revisión."
      : "Verifica la corrección y los documentos antes de enviarlos nuevamente a revisión."
    : isDraft
      ? "Actualiza la información del borrador antes de enviarlo a revisión."
      : "Actualiza la información observada y prepara la corrección para revisión.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
        <p className="text-muted-foreground">
          {pageSubtitle}
        </p>
      </div>

      {isRefreshing && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">
          Actualizando solicitud en segundo plano…
        </p>
      )}

      {openObservations.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/20">
          <AlertDescription className="space-y-2 text-amber-950 dark:text-amber-100">
            <p className="font-medium">Observaciones pendientes</p>
            <ul className="list-disc space-y-1 pl-5">
              {openObservations.map((observation) => (
                <li key={observation.id}>{observation.comment}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <RequestForm
        initialRequest={request}
        mode="edit"
        activeStep={activeStep}
        settlementContext={settlementContext.context}
        settlementContextError={settlementContext.error}
        settlementContextLoading={settlementContext.isLoading}
        onRetrySettlementContext={settlementContext.refetch}
        onRequestChanged={async () => {
          await Promise.all([refetch({ background: true }), settlementContext.refetch({ background: true })]);
        }}
        onRequestStateConflict={async () => {
          try {
            await refetch({ background: true });
          } catch {
            // El detalle vuelve a consultar su estado; no conservar el editor obsoleto.
          }
          router.replace(`${ROUTES.REQUESTS}/${request.id}`);
        }}
      />
    </div>
  );
}
