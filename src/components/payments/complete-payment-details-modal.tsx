"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Info } from "lucide-react";

import { PaymentCompletenessStatus } from "@/components/payments/payment-completeness-status";
import { PaymentImmutableContext, PaymentProofField } from "@/components/payments/payment-form-sections";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { formatExactMoney, isPaymentConflict, multiplyMoneyByRateHalfUp, normalizeFinalRate, PAYMENT_CONFLICT_MESSAGE } from "@/lib/payment-fx";
import { PaymentValuation } from "./payment-valuation";
import { useUploadNavigationGuard } from "@/hooks/use-upload-navigation-guard";
import { useCompletePaymentDetails, useUploadRequestDocument } from "@/hooks/use-requests";
import { getPaymentCompletenessPresentation } from "@/lib/payment-completeness";
import { getApiErrorMessage, getPaymentId, getRequestDisplayCode, validatePaymentProofFile } from "@/lib/requests";
import {
  PAYMENT_MISSING_FIELD,
  REQUEST_DOCUMENT_CATEGORY,
  type CompletePaymentDetailsInput,
  type PaymentRequest,
} from "@/types/requests";

const completePaymentDetailsSchema = z.object({
  operation_reference: z.string().trim().optional(),
});

type CompletePaymentDetailsFormValues = z.infer<typeof completePaymentDetailsSchema>;

interface CompletePaymentDetailsModalProps {
  request: PaymentRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void> | void;
}

export function CompletePaymentDetailsModal({ request, open, onOpenChange, onSuccess }: CompletePaymentDetailsModalProps) {
  const completion = useCompletePaymentDetails();
  const upload = useUploadRequestDocument();
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finalRate, setFinalRate] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const attempt = useRef<{ commandId: string; proofId?: string; payload?: CompletePaymentDetailsInput } | null>(null);
  const inFlight = useRef(false);
  const form = useForm<CompletePaymentDetailsFormValues>({
    resolver: zodResolver(completePaymentDetailsSchema),
    defaultValues: { operation_reference: "" },
  });
  const payment = request?.payment;
  const presentation = getPaymentCompletenessPresentation({
    completeness: payment?.completeness,
    missing_fields: payment?.missing_fields,
    proof_pending: payment?.proof_pending ?? request?.payment_proof_pending ?? request?.proof_pending,
    details_pending: payment?.details_pending ?? request?.payment_details_pending ?? request?.details_pending,
  });
  const referenceMissing = presentation.missingFields.includes(PAYMENT_MISSING_FIELD.OPERATION_REFERENCE);
  const proofMissing = presentation.missingFields.includes(PAYMENT_MISSING_FIELD.PROOF);
  const fxMissing = request?.currency === "USD" && payment?.valuation?.state !== "FINAL";
  const hasPending = presentation.hasPendingDetails || fxMissing;
  const isLoading = submitting || completion.isLoading || upload.isLoading;
  const canonicalPaidAt = payment?.paid_at ?? request?.paid_at;
  const canonicalAmount = payment?.original?.amount ?? payment?.amount_paid ?? request?.amount_disbursed;
  const originalAmount = payment?.original?.amount ?? String(payment?.amount_paid ?? request?.amount_disbursed ?? "");
  let preview: string | null = null;
  try { if (fxMissing && finalRate) preview = multiplyMoneyByRateHalfUp(originalAmount, finalRate); } catch { /* Validation is shown on submit. */ }

  useUploadNavigationGuard({ active: isLoading, message: "Hay una constancia de pago cargándose. Si sales o actualizas la página, la carga en curso puede cancelarse." });

  useEffect(() => {
    if (!open) return;
    form.reset({ operation_reference: "" });
    setProofFile(null);
    setProofError(null);
    setSubmitError(null);
    setFinalRate("");
    setConfirmed(false);
    setConflict(false);
    attempt.current = null;
  }, [form, open, payment?.id]);

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && isLoading) return;
    onOpenChange(nextOpen);
  }

  function handleProofChange(file: File | null): void {
    setProofFile(file);
    setProofError(file ? validatePaymentProofFile(file) : null);
  }

  async function submit(values: CompletePaymentDetailsFormValues): Promise<void> {
    if (inFlight.current || isLoading || conflict) return;
    const paymentId = request ? getPaymentId(request) : null;
    const nextProofError = proofFile ? validatePaymentProofFile(proofFile) : null;
    const missingProofError = proofMissing && !proofFile ? "Adjunta la constancia de pago." : nextProofError;
    const missingReference = referenceMissing && !values.operation_reference?.trim();
    setProofError(missingProofError);
    if (missingReference) form.setError("operation_reference", { message: "Ingresa la referencia de operación." });
    setSubmitError(null);
    if (!request || !paymentId || !hasPending || missingProofError || missingReference) return;
    let rate: string | undefined;
    if (fxMissing) {
      try { rate = normalizeFinalRate(finalRate); } catch (error) { setSubmitError(getApiErrorMessage(error)); return; }
      if (!confirmed) { setSubmitError("Confirma manualmente el TC final."); return; }
    }

    setSubmitting(true);
    inFlight.current = true;
    attempt.current ??= { commandId: crypto.randomUUID() };
    try {
      const uploadedProof = proofMissing && proofFile && !attempt.current.proofId
        ? await upload.uploadDocument(request.id, {
          file: proofFile,
          document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
        })
        : null;
      if (uploadedProof) attempt.current.proofId = uploadedProof.id;
      attempt.current.payload ??= {
        command_id: attempt.current.commandId,
        ...(fxMissing ? { final_fx_rate: rate, final_fx_confirmed: true } : {}),
        operation_reference: referenceMissing ? values.operation_reference?.trim() : undefined,
        proof_document_id: attempt.current.proofId,
      };
      await completion.completePaymentDetails(paymentId, attempt.current.payload);
      try { await onSuccess(); } catch { /* A refresh failure cannot undo a committed completion. */ }
      onOpenChange(false);
    } catch (error) {
      setConflict(isPaymentConflict(error));
      setSubmitError(isPaymentConflict(error) ? PAYMENT_CONFLICT_MESSAGE : getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
      inFlight.current = false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl" closeDisabled={isLoading}>
        <DialogHeader>
          <DialogTitle>Completar pago</DialogTitle>
          <DialogDescription>
            {request ? `Solicitud ${getRequestDisplayCode(request)}. Agrega únicamente los datos pendientes; fecha, cuenta y monto no se modificarán.` : "Completa los datos pendientes del pago."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form noValidate className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
            <DialogBody className="space-y-5 pr-1">
              {request ? (
                <PaymentImmutableContext
                  paidAt={canonicalPaidAt}
                  amountPaid={canonicalAmount}
                  currency={request.currency}
                  sourceAccountKey={payment?.source_account_key}
                  paymentCycleDate={payment?.payment_cycle_date}
                  driveRouteModel={payment?.drive_route_model}
                  driveRoutingDate={payment?.drive_routing_date}
                  driveRouteClassifiedAt={payment?.drive_route_classified_at}
                />
              ) : null}
              {request ? <PaymentCompletenessStatus request={request} /> : null}
              {request?.currency && originalAmount ? <p>Principal de solicitud confirmado: {formatExactMoney(originalAmount, request.currency)}. No determina la moneda de desembolso bancario.</p> : null}
              <PaymentValuation valuation={payment?.valuation ?? request?.valuation} />
              {!hasPending ? (
                <p className="rounded-md border bg-muted/30 p-3 text-sm">Este pago ya tiene referencia y constancia.</p>
              ) : null}
              <fieldset disabled={isLoading || !!attempt.current?.payload} className="space-y-5">
              {referenceMissing ? (
                <FormField control={form.control} name="operation_reference" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referencia de operación</FormLabel>
                    <FormControl><Input required maxLength={120} placeholder="Telecrédito u operación bancaria" {...field} data-autofocus data-testid="complete-payment-reference-input" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              ) : null}
              {proofMissing ? <PaymentProofField id="complete-payment-proof-input" required error={proofError} errorId="complete-payment-proof-error" testId="complete-payment-proof-input" autoFocus={!referenceMissing} onChange={handleProofChange} /> : null}
              </fieldset>
              {fxMissing ? <div className="space-y-3">
                <label htmlFor="final-fx-rate" className="text-sm font-medium">TC final (PEN por USD)</label>
                <Input id="final-fx-rate" inputMode="decimal" value={finalRate} onChange={(event) => { setFinalRate(event.target.value); setConfirmed(false); }} disabled={isLoading || !!attempt.current} aria-describedby="fx-preview" />
                <p id="fx-preview" className="text-sm">{preview ? `Valoración contable: ${formatExactMoney(preview, "PEN")}. El principal USD no cambia.` : "Ingresa el TC real manualmente; el referencial no se confirma automáticamente."}</p>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={isLoading || !!attempt.current} onChange={(event) => setConfirmed(event.target.checked)} />Confirmo el TC final ingresado para este pago</label>
                <p className="text-sm text-muted-foreground">Un saldo presupuestal negativo por esta valoración no bloquea completar el pago.</p>
              </div> : null}
              {submitError ? <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{submitError}</p> : null}
              {isLoading ? <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100"><Info className="h-4 w-4" /><AlertDescription>No cierres esta ventana mientras se guarda la constancia</AlertDescription></Alert> : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>Cerrar</Button>
              {hasPending ? <Button type="submit" disabled={isLoading || !request || conflict}>{isLoading ? "Guardando..." : "Completar pago"}</Button> : null}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
