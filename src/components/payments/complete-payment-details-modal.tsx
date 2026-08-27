"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PaymentAllocationProofCoverage } from "@/components/payments/payment-allocation-proof-coverage";
import {
  PaymentImmutableContext,
  PaymentProofField,
  PaymentSourceAccountSelect,
} from "@/components/payments/payment-form-sections";
import { useUploadNavigationGuard } from "@/hooks/use-upload-navigation-guard";
import { useCompletePaymentDetails } from "@/hooks/use-requests";
import { getApiErrorMessage, getPaymentId, getRequestDisplayCode, validatePaymentProofFile } from "@/lib/requests";
import {
  DRIVE_SOURCE_ACCOUNT,
  type DriveSourceAccount,
  type PaymentRequest,
} from "@/types/requests";

const completePaymentDetailsSchema = z.object({
  source_account_key: z.string().optional(),
  operation_reference: z.string().trim().optional(),
  bank_commission: z.coerce.number().min(0, "La comisión no puede ser negativa.").optional(),
  notes: z.string().trim().optional(),
});

type CompletePaymentDetailsFormValues = z.infer<typeof completePaymentDetailsSchema>;

interface CompletePaymentDetailsModalProps {
  request: PaymentRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void> | void;
}

function isDriveSourceAccount(value?: string): value is DriveSourceAccount {
  return Boolean(value && Object.values(DRIVE_SOURCE_ACCOUNT).includes(value as DriveSourceAccount));
}

export function CompletePaymentDetailsModal({ request, open, onOpenChange, onSuccess }: CompletePaymentDetailsModalProps) {
  const { completePaymentDetails, isLoading } = useCompletePaymentDetails();
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<CompletePaymentDetailsFormValues>({
    resolver: zodResolver(completePaymentDetailsSchema),
    defaultValues: { source_account_key: undefined, operation_reference: "", bank_commission: undefined, notes: "" },
  });
  const payment = request?.payment;
  const sourceMissing = payment?.drive_projection_status === "SOURCE_REQUIRED";
  const referenceMissing = payment ? !payment.operation_reference : Boolean(request);
  const proofMissing = payment ? !payment.proof_document_id : Boolean(request);
  const canonicalPaidAt = payment?.paid_at ?? request?.paid_at;
  const canonicalAmount = payment ? Number(payment.amount_paid) : request?.amount_disbursed;

  useUploadNavigationGuard({ active: isLoading, message: "Hay una constancia de pago cargándose. Si sales o actualizas la página, la carga en curso puede cancelarse." });

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && isLoading) return;
    onOpenChange(nextOpen);
  }

  useEffect(() => {
    if (!open) return;
    form.reset({ source_account_key: undefined, operation_reference: "", bank_commission: payment?.bank_commission ?? undefined, notes: "" });
    setProofFile(null);
    setProofError(null);
    setSourceError(null);
    setSubmitError(null);
  }, [form, open, payment]);

  function handleProofChange(file: File | null): void {
    setProofFile(file);
    setProofError(file ? validatePaymentProofFile(file) : null);
  }

  async function submit(values: CompletePaymentDetailsFormValues): Promise<void> {
    const paymentId = request ? getPaymentId(request) : null;
    const nextProofError = proofFile ? validatePaymentProofFile(proofFile) : null;
    const missingProofError = proofMissing && !proofFile ? "Adjunta la constancia global de pago." : nextProofError;
    const missingReference = referenceMissing && !values.operation_reference?.trim();
    const missingSource = sourceMissing && !isDriveSourceAccount(values.source_account_key);
    setProofError(missingProofError);
    setSourceError(missingSource ? "Selecciona la cuenta de origen." : null);
    if (missingReference) {
      form.setError("operation_reference", { message: "Ingresa la referencia de operación." });
    }
    setSubmitError(null);
    if (!paymentId || missingProofError || missingReference || missingSource) return;

    try {
      await completePaymentDetails(paymentId, {
        proof: proofMissing ? proofFile ?? undefined : undefined,
        source_account_key: sourceMissing && isDriveSourceAccount(values.source_account_key) ? values.source_account_key : undefined,
        operation_reference: referenceMissing ? values.operation_reference?.trim() || undefined : undefined,
        bank_commission: values.bank_commission,
        notes: values.notes?.trim() || undefined,
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
            {request ? `Solicitud ${getRequestDisplayCode(request)}. Completa todos los datos que aún faltan. Esta acción no cambia el monto ni la fecha de pago.` : "Completa los datos pendientes del pago."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form noValidate className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
            <DialogBody className="space-y-6 pr-1">
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
              <fieldset className="space-y-4 rounded-md border p-4">
                <legend className="px-1 text-sm font-semibold">Datos pendientes y opcionales</legend>
                <div className="grid gap-4 md:grid-cols-2">
                  {sourceMissing ? (
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="complete-payment-source-account">Cuenta de origen Enseña Perú</label>
                      <PaymentSourceAccountSelect
                        id="complete-payment-source-account"
                        value={form.watch("source_account_key")}
                        required
                        describedBy={sourceError ? "complete-payment-source-error" : undefined}
                        testId="complete-payment-source-account-select"
                        autoFocus
                        onChange={(value) => { form.setValue("source_account_key", value); setSourceError(null); }}
                      />
                      {sourceError ? <p id="complete-payment-source-error" role="alert" className="text-sm text-destructive">{sourceError}</p> : null}
                    </div>
                  ) : null}
                  {referenceMissing ? (
                    <FormField control={form.control} name="operation_reference" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Referencia de operación</FormLabel>
                        <FormControl><Input required placeholder="Telecrédito u operación bancaria" {...field} data-autofocus={!sourceMissing ? true : undefined} data-testid="complete-payment-reference-input" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  ) : null}
                  <FormField control={form.control} name="bank_commission" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Comisión bancaria</FormLabel>
                      <FormControl><Input type="number" min="0" step="0.01" placeholder="Opcional" {...field} value={field.value ?? ""} onChange={(event) => field.onChange(event.target.value === "" ? undefined : event.target.value)} data-testid="complete-payment-commission-input" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="notes" render={({ field }) => (
                  <FormItem><FormLabel>Notas</FormLabel><FormControl><Textarea placeholder="Opcional" {...field} data-testid="complete-payment-notes-input" /></FormControl><FormMessage /></FormItem>
                )} />
              </fieldset>
              {request?.allocations?.length ? <PaymentAllocationProofCoverage request={request} /> : null}
              {proofMissing ? <PaymentProofField id="complete-payment-proof-input" required error={proofError} errorId="complete-payment-proof-error" testId="complete-payment-proof-input" autoFocus={!sourceMissing && !referenceMissing} onChange={handleProofChange} /> : null}
              {submitError ? <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{submitError}</p> : null}
              {isLoading ? <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100"><Info className="h-4 w-4" /><AlertDescription>No cierres esta ventana mientras se carga el archivo</AlertDescription></Alert> : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>Cancelar</Button>
              <Button type="submit" disabled={isLoading || !request}>{isLoading ? "Guardando..." : "Completar pago"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
