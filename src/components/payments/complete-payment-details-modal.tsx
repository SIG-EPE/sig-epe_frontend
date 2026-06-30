"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PaymentAllocationProofCoverage } from "@/components/payments/payment-allocation-proof-coverage";
import { useUploadNavigationGuard } from "@/hooks/use-upload-navigation-guard";
import { useCompletePaymentDetails } from "@/hooks/use-requests";
import { PAYMENT_PROOF_ACCEPT, PAYMENT_PROOF_ACCEPTED_FORMATS_LABEL, formatRequestCurrency, getApiErrorMessage, getPaymentId, getRequestDisplayCode, getRequestPayableAmount, validatePaymentProofFile } from "@/lib/requests";
import type { PaymentRequest } from "@/types/requests";

const completePaymentDetailsSchema = z.object({
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

export function CompletePaymentDetailsModal({ request, open, onOpenChange, onSuccess }: CompletePaymentDetailsModalProps) {
  const { completePaymentDetails, isLoading } = useCompletePaymentDetails();
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<CompletePaymentDetailsFormValues>({
    resolver: zodResolver(completePaymentDetailsSchema),
    defaultValues: {
      operation_reference: "",
      bank_commission: undefined,
      notes: "",
    },
  });
  const uploadWarningMessage = "No cierres esta ventana mientras se carga el archivo";

  useUploadNavigationGuard({ active: isLoading, message: "Hay una constancia de pago cargándose. Si sales o actualizas la página, la carga en curso puede cancelarse." });

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && isLoading) return;
    onOpenChange(nextOpen);
  }

  useEffect(() => {
    if (!open) return;
    form.reset({
      operation_reference: request?.payment?.operation_reference ?? "",
      bank_commission: request?.payment?.bank_commission ?? undefined,
      notes: "",
    });
    setProofFile(null);
    setProofError(null);
    setSubmitError(null);
  }, [form, open, request]);

  function handleProofChange(file: File | null) {
    setProofFile(file);
    setProofError(file ? validatePaymentProofFile(file) : null);
  }

  async function submit(values: CompletePaymentDetailsFormValues) {
    const paymentId = request ? getPaymentId(request) : null;
    const nextProofError = proofFile ? validatePaymentProofFile(proofFile) : null;
    setProofError(nextProofError);
    setSubmitError(null);
    if (!paymentId || nextProofError) return;

    try {
      await completePaymentDetails(paymentId, {
        proof: proofFile ?? undefined,
        operation_reference: values.operation_reference?.trim() || undefined,
        bank_commission: values.bank_commission,
        notes: values.notes?.trim() || undefined,
      });
      await onSuccess();
      onOpenChange(false);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  }

  const payableAmount = request ? getRequestPayableAmount(request) : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl" closeDisabled={isLoading}>
        <DialogHeader>
          <DialogTitle>Completar datos de pago</DialogTitle>
          <DialogDescription>
            {request ? `Solicitud ${getRequestDisplayCode(request)} por ${formatRequestCurrency(payableAmount, request.currency)}. Esta acción no cambia el monto ni la fecha de pago; solo completa referencia, comisión, notas o constancia pendiente.` : "Completa la constancia o referencia pendiente."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField control={form.control} name="operation_reference" render={({ field }) => (
                <FormItem>
                  <FormLabel>Referencia de operación</FormLabel>
                  <FormControl><Input placeholder="Telecrédito u operación bancaria" {...field} data-testid="complete-payment-reference-input" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="bank_commission" render={({ field }) => (
                <FormItem>
                  <FormLabel>Comisión bancaria</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Opcional"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(event) => field.onChange(event.target.value === "" ? undefined : event.target.value)}
                      data-testid="complete-payment-commission-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notas</FormLabel>
                <FormControl><Textarea placeholder="Opcional" {...field} data-testid="complete-payment-notes-input" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            {request?.allocations?.length ? <PaymentAllocationProofCoverage request={request} /> : null}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="complete-payment-proof-input">Constancia de pago ({PAYMENT_PROOF_ACCEPTED_FORMATS_LABEL})</label>
              <Input
                id="complete-payment-proof-input"
                type="file"
                accept={PAYMENT_PROOF_ACCEPT}
                onChange={(event) => handleProofChange(event.target.files?.[0] ?? null)}
                data-testid="complete-payment-proof-input"
              />
              {proofError && <p className="text-sm text-destructive">{proofError}</p>}
            </div>
            {submitError && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{submitError}</p>}
            {isLoading && (
              <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-amber-950 dark:text-amber-100">{uploadWarningMessage}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>Cancelar</Button>
              <Button type="submit" disabled={isLoading || !request}>{isLoading ? "Guardando..." : "Completar datos"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
