"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, Wrench } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiRequestError } from "@/lib/api-client";
import { driveHierarchyApi } from "@/lib/drive-hierarchy-api";
import {
  DRIVE_TOPOLOGY_CLEANUP_OUTCOME,
  type DrivePaymentTopologyRecoveryCandidate,
  type ReconcileCurrentPaymentDailyTopologyResult,
} from "@/types/drive-hierarchy";

const RECOVERY_ERROR_MESSAGE: Readonly<Record<string, string>> = {
  DAILY_TOPOLOGY_RECOVERY_APPROVAL_REQUIRED:
    "Falta la aprobación explícita de la recuperación excepcional.",
  DAILY_TOPOLOGY_CLEANUP_APPROVAL_REQUIRED:
    "La limpieza requiere una aprobación separada. Cierra y vuelve a confirmar el alcance.",
  DAILY_TOPOLOGY_RECOVERY_PAYMENT_NOT_FOUND:
    "El pago ya no está disponible. Actualiza Gestión de Drive.",
  DAILY_TOPOLOGY_RECOVERY_NOT_NEEDED:
    "La inconsistencia ya no requiere esta recuperación. Actualiza Gestión de Drive.",
  DAILY_TOPOLOGY_PENDING_LEASE_STATE_INVALID:
    "La proyección PENDING conserva un lease inesperado. No se modificó Drive; requiere revisión técnica.",
  DAILY_TOPOLOGY_EVIDENCE_INCONSISTENT:
    "La evidencia inmutable ya no coincide con la proyección. No se modificó Drive.",
  DAILY_TOPOLOGY_ACTIVE_ROOT_CHANGED:
    "La raíz ACTIVE cambió respecto de la evidencia inmutable. No se modificó Drive.",
  DAILY_TOPOLOGY_DATE_PARENT_UNSAFE:
    "La fecha legado no es una autoridad única y segura. No se creó un DAY duplicado.",
  DAILY_TOPOLOGY_DESTINATION_UNSAFE:
    "La cuenta de destino cambió de padre o permisos. Se conservó sin eliminarla.",
  DAILY_TOPOLOGY_DESTINATION_CHANGED:
    "La cuenta de destino está ausente, duplicada o cambió. No se modificó Drive.",
  DAILY_TOPOLOGY_ADOPTION_FAILED:
    "No se pudo resolver la cuenta actual como autoridad. No se autorizó limpieza.",
};

function recoveryErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    const code = typeof error.body.code === "string" ? error.body.code : "";
    if (RECOVERY_ERROR_MESSAGE[code]) return RECOVERY_ERROR_MESSAGE[code];
    if (error.status === 403) {
      return "Solo el Responsable GIOF puede ejecutar esta recuperación técnica.";
    }
    const message = Array.isArray(error.body.message)
      ? error.body.message.join(". ")
      : error.body.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "No se completó la recuperación. No hubo reintento automático; actualiza el estado antes de una nueva decisión.";
}

export function PaymentTopologyRecoveryCard() {
  const [candidates, setCandidates] = useState<DrivePaymentTopologyRecoveryCandidate[]>([]);
  const [selected, setSelected] = useState<DrivePaymentTopologyRecoveryCandidate | null>(null);
  const [cleanupApproved, setCleanupApproved] = useState(false);
  const [result, setResult] = useState<ReconcileCurrentPaymentDailyTopologyResult | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionLockRef = useRef(false);

  async function loadCandidates(signal?: AbortSignal): Promise<void> {
    try {
      const response = await driveHierarchyApi.getPaymentTopologyRecoveryCandidates(signal);
      if (signal?.aborted) return;
      setCandidates(response.filter((candidate) => candidate.reconciliationNeeded));
      setReadError(null);
    } catch (error) {
      if (signal?.aborted) return;
      setReadError(recoveryErrorMessage(error));
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadCandidates(controller.signal);
    return () => controller.abort();
  }, []);

  function open(candidate: DrivePaymentTopologyRecoveryCandidate): void {
    setSelected(candidate);
    setCleanupApproved(false);
    setResult(null);
    setActionError(null);
    submissionLockRef.current = false;
  }

  function close(): void {
    if (isSubmitting) return;
    setSelected(null);
    setCleanupApproved(false);
    setResult(null);
    setActionError(null);
  }

  async function reconcile(): Promise<void> {
    if (!selected || submissionLockRef.current || result || actionError) return;
    submissionLockRef.current = true;
    setIsSubmitting(true);
    const timestamp = Date.now();
    try {
      const response = await driveHierarchyApi.reconcileCurrentPaymentDailyTopology(
        selected.paymentId,
        {
          reason:
            "Recuperación técnica excepcional de autoridad DAILY_V1 aprobada desde Gestión de Drive.",
          approvalReference: `UI-MANAGEMENT-DAILY-RECOVERY-${timestamp}`,
          cleanupResidues: cleanupApproved,
          cleanupApprovalReference: cleanupApproved
            ? `UI-MANAGEMENT-LEGACY-U-CLEANUP-${timestamp}`
            : undefined,
        },
      );
      setResult(response);
      await loadCandidates();
    } catch (error) {
      setActionError(recoveryErrorMessage(error));
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  }

  if (isLoading || (!readError && candidates.length === 0 && !selected)) return null;

  const trashedCount = result?.cleanupResults.filter(
    (item) => item.outcome === DRIVE_TOPOLOGY_CLEANUP_OUTCOME.TRASHED,
  ).length ?? 0;
  const preservedCount = result?.cleanupResults.filter(
    (item) => item.outcome === DRIVE_TOPOLOGY_CLEANUP_OUTCOME.PRESERVED_BLOCKED,
  ).length ?? 0;

  return (
    <>
      <Card className="border-amber-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Recuperación técnica avanzada
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Mantenimiento excepcional para proyecciones que Gestión de Drive confirmó como inconsistentes. No forma parte del flujo normal de pagos.
          </p>
          {readError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{readError}</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              {candidates.map((candidate) => (
                <div key={candidate.paymentId} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{candidate.requestCode}</strong>
                      <Badge variant="outline">{candidate.status}</Badge>
                    </div>
                    <p>Fecha de destino: {candidate.routeDate} · Cuenta: {candidate.account}</p>
                    <p className="text-amber-700 dark:text-amber-300">Error: {candidate.reasonCode}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => open(candidate)}>
                    Revisar recuperación
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={selected !== null} onOpenChange={(nextOpen) => { if (!nextOpen) close(); }}>
        <DialogContent className="max-w-2xl" closeDisabled={isSubmitting}>
          <DialogHeader>
            <DialogTitle>Confirmar mantenimiento excepcional</DialogTitle>
            <DialogDescription>
              {selected ? `Pago ${selected.requestCode}. Esta acción no es una operación rutinaria de pago.` : "Recuperación técnica restringida."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 pr-1">
            {!result ? (
              <>
                <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    El servidor volverá a validar la evidencia inmutable contra la raíz ACTIVE, reutilizará el CYCLE legado y adoptará la cuenta de destino actual. No debe crear un DAY duplicado ni eliminar la cuenta de destino.
                  </AlertDescription>
                </Alert>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>No modifica la evidencia inmutable ni mueve el pago o sus documentos.</li>
                  <li>No usa la revisión temporal del lease PENDING como autoridad.</li>
                  <li>No ejecuta reintentos automáticos si una validación falla.</li>
                </ul>
                <label className="flex items-start gap-3 rounded-md border p-3">
                  <Checkbox
                    checked={cleanupApproved}
                    onCheckedChange={(checked) => setCleanupApproved(checked === true)}
                    disabled={isSubmitting}
                    aria-label="Aprobar por separado la limpieza del residuo legado"
                  />
                  <span>
                    <strong>Aprobación separada de limpieza.</strong>{" "}
                    Si existe un NO-ASIGNADOS legado incluido en la evidencia, retirar solo ese U no-destino después de resolver la autoridad y de una validación fresca de vaciedad, ACL y referencias.
                  </span>
                </label>
              </>
            ) : (
              <Alert className="border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-semibold">Cuenta de destino adoptada como autoridad.</p>
                  <p>El pago y sus documentos no fueron movidos. Residuos retirados: {trashedCount}; conservados por seguridad: {preservedCount}.</p>
                </AlertDescription>
              </Alert>
            )}
            {actionError ? (
              <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
                {actionError}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            {result ? (
              <Button type="button" onClick={close}>Cerrar</Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={close} disabled={isSubmitting}>Cancelar</Button>
                <Button type="button" onClick={() => void reconcile()} disabled={isSubmitting || Boolean(actionError)}>
                  {isSubmitting ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Validando y reconciliando…</> : "Confirmar recuperación excepcional"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
