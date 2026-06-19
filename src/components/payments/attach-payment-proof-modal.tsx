"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUploadNavigationGuard } from "@/hooks/use-upload-navigation-guard";
import { useAttachPaymentProof } from "@/hooks/use-requests";
import { getBusinessDateTimeLocalValue, parseBusinessDateTimeLocalToIso } from "@/lib/business-timezone";
import { PAYMENT_PROOF_ACCEPT, PAYMENT_PROOF_ACCEPTED_FORMATS_LABEL, formatRequestCurrency, getApiErrorMessage, getPaymentId, getPlanningLineDisplay, getRequestDisplayCode, validatePaymentProofFile } from "@/lib/requests";
import type { PaymentRequest } from "@/types/requests";

interface AttachPaymentProofModalProps {
  request: PaymentRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void> | void;
}

export function AttachPaymentProofModal({ request, open, onOpenChange, onSuccess }: AttachPaymentProofModalProps) {
  const { attachPaymentProof, isLoading } = useAttachPaymentProof();
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [operationReference, setOperationReference] = useState("");
  const [paidAt, setPaidAt] = useState(getBusinessDateTimeLocalValue());
  const [notes, setNotes] = useState("");
  const [proofError, setProofError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const uploadWarningMessage = "No cierres esta ventana mientras se carga el archivo";

  useUploadNavigationGuard({ active: isLoading, message: "Hay una constancia de pago cargándose. Si sales o actualizas la página, la carga en curso puede cancelarse." });

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && isLoading) return;
    onOpenChange(nextOpen);
  }

  useEffect(() => {
    if (!open) return;
    setProofFile(null);
    setOperationReference("");
    setPaidAt(getBusinessDateTimeLocalValue());
    setNotes("");
    setProofError(null);
    setSubmitError(null);
  }, [open, request]);

  function handleProofChange(file: File | null): void {
    setProofFile(file);
    setProofError(validatePaymentProofFile(file));
  }

  async function submit(): Promise<void> {
    const paymentId = request ? getPaymentId(request) : null;
    const nextProofError = validatePaymentProofFile(proofFile);
    setProofError(nextProofError);
    setSubmitError(null);
    if (!paymentId) {
      setSubmitError("No se encontró un pago existente para asociar el comprobante.");
      return;
    }
    if (!proofFile || nextProofError) return;

    try {
      await attachPaymentProof(paymentId, {
        proof: proofFile,
        operation_reference: operationReference.trim() || undefined,
        paid_at: paidAt ? parseBusinessDateTimeLocalToIso(paidAt) : undefined,
        notes: notes.trim() || undefined,
      });
      await onSuccess();
      onOpenChange(false);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  }

  const allocations = request?.allocations?.filter((allocation) => allocation.id) ?? [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" closeDisabled={isLoading}>
        <DialogHeader>
          <DialogTitle>Agregar comprobante POA</DialogTitle>
          <DialogDescription>
            {request ? `Solicitud ${getRequestDisplayCode(request)}. Subirás una sola constancia; el sistema la asociará automáticamente a todas las líneas POA del pago.` : "Sube la constancia de pago para asociarla a todas las líneas POA."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 rounded-md border p-3" data-testid="attach-proof-allocation-list">
            <p className="text-sm font-medium">Líneas POA que quedarán cubiertas automáticamente</p>
            {allocations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay líneas POA disponibles para asociar.</p>
            ) : allocations.map((allocation, index) => {
              const allocationId = allocation.id!;
              const line = allocation.planning_line ?? allocation.budgetPlanningLine;
              return (
                <div key={allocationId} className="flex items-start gap-3 rounded-md border bg-muted/30 p-2 text-sm">
                  <span className="mt-0.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden="true">✓</span>
                  <span className="flex-1">
                    <span className="block font-medium">Línea POA {index + 1}: {getPlanningLineDisplay(line)}</span>
                    <span className="block text-muted-foreground">{formatRequestCurrency(allocation.amount, request?.currency ?? "PEN")}</span>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="attach-payment-reference-input">Referencia de operación</label>
              <Input id="attach-payment-reference-input" value={operationReference} onChange={(event) => setOperationReference(event.target.value)} placeholder="Opcional" data-testid="attach-payment-reference-input" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="attach-payment-paid-at-input">Fecha y hora de pago (hora Perú)</label>
              <Input id="attach-payment-paid-at-input" type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} data-testid="attach-payment-paid-at-input" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="attach-payment-proof-input">Constancia de pago ({PAYMENT_PROOF_ACCEPTED_FORMATS_LABEL})</label>
            <Input id="attach-payment-proof-input" type="file" accept={PAYMENT_PROOF_ACCEPT} onChange={(event) => handleProofChange(event.target.files?.[0] ?? null)} data-testid="attach-payment-proof-input" />
            {proofError && <p className="text-sm text-destructive">{proofError}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="attach-payment-notes-input">Notas</label>
            <Textarea id="attach-payment-notes-input" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Opcional" data-testid="attach-payment-notes-input" />
          </div>

          {submitError && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{submitError}</p>}
          {isLoading && (
            <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-amber-950 dark:text-amber-100">{uploadWarningMessage}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>Cancelar</Button>
          <Button type="button" onClick={() => void submit()} disabled={isLoading || !request}>{isLoading ? "Asociando..." : "Asociar comprobante"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
