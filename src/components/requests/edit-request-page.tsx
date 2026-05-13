"use client";

import { useParams, useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRequest } from "@/hooks/use-requests";
import { ROUTES } from "@/lib/constants";
import { REQUEST_STATUS } from "@/types/requests";
import { RequestForm } from "./request-form";

export function EditRequestPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { request, isLoading, error, refetch } = useRequest(params.id);

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

  const isDraft = request.status === REQUEST_STATUS.DRAFT;
  const isObserved = request.status === REQUEST_STATUS.OBSERVED;

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{isDraft ? "Editar borrador" : "Corregir solicitud"}</h1>
        <p className="text-muted-foreground">
          {isDraft ? "Actualiza la información del borrador antes de enviarlo a revisión." : "Actualiza la información observada y reenvía la solicitud a revisión."}
        </p>
      </div>

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

      <RequestForm initialRequest={request} mode="edit" />
    </div>
  );
}
