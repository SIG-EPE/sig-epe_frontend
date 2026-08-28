"use client";

import { useEffect, useState } from "react";
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
import { useUploadNavigationGuard } from "@/hooks/use-upload-navigation-guard";
import { useCompletePaymentDetails, useUploadRequestDocument } from "@/hooks/use-requests";
import { getPaymentCompletenessPresentation } from "@/lib/payment-completeness";
import { getApiErrorMessage, getPaymentId, getRequestDisplayCode, validatePaymentProofFile } from "@/lib/requests";
import {
  PAYMENT_MISSING_FIELD,
  REQUEST_DOCUMENT_CATEGORY,
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
  const isLoading = completion.isLoading || upload.isLoading;
  const canonicalPaidAt = payment?.paid_at ?? request?.paid_at;
  const canonicalAmount = payment ? Number(payment.amount_paid) : request?.amount_disbursed;

  useUploadNavigationGuard({ active: isLoading, message: "Hay una constancia de pago cargándose. Si sales o actualizas la página, la carga en curso puede cancelarse." });

  useEffect(() => {
    if (!open) return;
    form.reset({ operation_reference: "" });
    setProofFile(null);
    setProofError(null);
    setSubmitError(null);
  }, [form, open, payment]);

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && isLoading) return;
    onOpenChange(nextOpen);
  }

  function handleProofChange(file: File | null): void {
    setProofFile(file);
    setProofError(file ? validatePaymentProofFile(file) : null);
  }

  async function submit(values: CompletePaymentDetailsFormValues): Promise<void> {
    const paymentId = request ? getPaymentId(request) : null;
    const nextProofError = proofFile ? validatePaymentProofFile(proofFile) : null;
    const missingProofError = proofMissing && !proofFile ? "Adjunta la constancia de pago." : nextProofError;
    const missingReference = referenceMissing && !values.operation_reference?.trim();
    setProofError(missingProofError);
    if (missingReference) form.setError("operation_reference", { message: "Ingresa la referencia de operación." });
    setSubmitError(null);
    if (!request || !paymentId || !presentation.hasPendingDetails || missingProofError || missingReference) return;

    try {
      const uploadedProof = proofMissing && proofFile
        ? await upload.uploadDocument(request.id, {
          file: proofFile,
          document_category: REQUEST_DOCUMENT_CATEGORY.PAYMENT_PROOF,
        })
        : null;
      await completion.completePaymentDetails(paymentId, {
        operation_reference: referenceMissing ? values.operation_reference?.trim() : undefined,
        proof_document_id: uploadedProof?.id,
      });
      await onSuccess();
      onOpenChange(false);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
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
              {!presentation.hasPendingDetails ? (
                <p className="rounded-md border bg-muted/30 p-3 text-sm">Este pago ya tiene referencia y constancia.</p>
              ) : null}
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
              {submitError ? <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{submitError}</p> : null}
              {isLoading ? <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100"><Info className="h-4 w-4" /><AlertDescription>No cierres esta ventana mientras se guarda la constancia</AlertDescription></Alert> : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>Cerrar</Button>
              {presentation.hasPendingDetails ? <Button type="submit" disabled={isLoading || !request}>{isLoading ? "Guardando..." : "Completar pago"}</Button> : null}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
