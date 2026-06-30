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
import { useRegisterPayment } from "@/hooks/use-requests";
import { getBusinessDateTimeLocalValue, parseBusinessDateTimeLocalToIso } from "@/lib/business-timezone";
import { PAYMENT_PROOF_ACCEPT, PAYMENT_PROOF_ACCEPTED_FORMATS_LABEL, formatRequestCurrency, getApiErrorMessage, getRequestPayableAmount, isRexanExcessRequest, toMoneyCents, validatePaymentProofFile } from "@/lib/requests";
import type { PaymentRequest, RegisterPaymentInput } from "@/types/requests";

const registerPaymentSchema = z.object({
  paid_at: z.string().min(1, "Indica la fecha y hora de pago."),
  operation_reference: z.string().trim().min(3, "Ingresa la referencia de operación o telecrédito."),
  amount_paid: z.coerce.number().positive("El monto pagado debe ser mayor a cero."),
  bank_commission: z.coerce.number().min(0, "La comisión no puede ser negativa.").optional(),
  notes: z.string().trim().optional(),
});

type RegisterPaymentFormValues = z.infer<typeof registerPaymentSchema>;

interface RegisterPaymentModalProps {
  request: PaymentRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void> | void;
}

function getDefaultPaidAtValue(): string {
  return getBusinessDateTimeLocalValue();
}

export function RegisterPaymentModal({ request, open, onOpenChange, onSuccess }: RegisterPaymentModalProps) {
  const { registerPayment, isLoading } = useRegisterPayment();
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<RegisterPaymentFormValues>({
    resolver: zodResolver(registerPaymentSchema),
    defaultValues: {
      paid_at: getDefaultPaidAtValue(),
      operation_reference: "",
      amount_paid: request ? getRequestPayableAmount(request) : 0,
      bank_commission: undefined,
      notes: "",
    },
  });
  const isRexanExcess = request ? isRexanExcessRequest(request) : false;
  const payableAmount = request ? getRequestPayableAmount(request) : 0;
  const uploadWarningMessage = "No cierres esta ventana mientras se carga el archivo";

  useUploadNavigationGuard({ active: isLoading, message: "Hay una constancia de pago cargándose. Si sales o actualizas la página, la carga en curso puede cancelarse." });

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && isLoading) return;
    onOpenChange(nextOpen);
  }

  function handleProofChange(file: File | null) {
    setProofFile(file);
    setProofError(validatePaymentProofFile(file));
  }

  useEffect(() => {
    if (!open || !request) return;
    form.reset({
      paid_at: getDefaultPaidAtValue(),
      operation_reference: "",
      amount_paid: getRequestPayableAmount(request),
      bank_commission: undefined,
      notes: "",
    });
    setProofFile(null);
    setProofError(null);
    setSubmitError(null);
  }, [form, open, request]);

  async function submit(values: RegisterPaymentFormValues) {
    const nextProofError = validatePaymentProofFile(proofFile);
    setProofError(nextProofError);
    setSubmitError(null);
    if (!request || !proofFile || nextProofError) return;
    const amountPaid = Number(values.amount_paid);
    const amountPaidCents = toMoneyCents(amountPaid) ?? 0;
    const payableAmountCents = toMoneyCents(getRequestPayableAmount(request)) ?? 0;
    if (amountPaidCents > payableAmountCents) {
      setSubmitError(`El monto pagado no puede exceder el monto aprobado de ${formatRequestCurrency(getRequestPayableAmount(request), request.currency)}.`);
      return;
    }
    if (isRexanExcessRequest(request) && amountPaidCents !== payableAmountCents) {
      setSubmitError("El monto pagado debe coincidir con el saldo aprobado para esta rendición.");
      return;
    }

    const input: RegisterPaymentInput = {
      paid_at: parseBusinessDateTimeLocalToIso(values.paid_at),
      operation_reference: values.operation_reference.trim(),
      amount_paid: amountPaid,
      bank_commission: values.bank_commission,
      notes: values.notes?.trim() || undefined,
      proof: proofFile,
    };

    try {
      await registerPayment(request.id, input);
      await onSuccess();
      form.reset({
        paid_at: getDefaultPaidAtValue(),
        operation_reference: "",
        amount_paid: getRequestPayableAmount(request),
        bank_commission: undefined,
        notes: "",
      });
      setProofFile(null);
      onOpenChange(false);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl" closeDisabled={isLoading}>
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            {request ? `Solicitud ${request.request_code ?? request.sequential_number ?? request.id} por ${formatRequestCurrency(payableAmount, request.currency)}${isRexanExcess ? " · Saldo REXAN" : ""}` : "Completa los datos del telecrédito."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField control={form.control} name="paid_at" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha y hora de pago (hora Perú)</FormLabel>
                  <FormControl><Input type="datetime-local" {...field} data-testid="payment-paid-at-input" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="operation_reference" render={({ field }) => (
                <FormItem>
                  <FormLabel>Referencia de operación</FormLabel>
                  <FormControl><Input placeholder="Telecrédito u operación bancaria" {...field} data-testid="payment-reference-input" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="amount_paid" render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto pagado</FormLabel>
                  <FormControl><Input type="number" min="0" max={payableAmount} step="0.01" {...field} readOnly={isRexanExcess} data-testid="payment-amount-input" /></FormControl>
                  <p className="text-xs text-muted-foreground">Monto máximo permitido: {formatRequestCurrency(payableAmount, request?.currency ?? "PEN")}. No registres pagos por encima del monto aprobado.</p>
                  {isRexanExcess && <p className="text-xs text-muted-foreground">El pago debe coincidir con el saldo aprobado de la rendición.</p>}
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="bank_commission" render={({ field }) => (
                <FormItem>
                  <FormLabel>Comisión bancaria</FormLabel>
                  <FormControl><Input type="number" min="0" step="0.01" placeholder="Opcional" {...field} value={field.value ?? ""} data-testid="payment-commission-input" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notas</FormLabel>
                <FormControl><Textarea placeholder="Opcional" {...field} data-testid="payment-notes-input" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            {request?.allocations?.length ? <PaymentAllocationProofCoverage request={request} compact mode="register-general-proof" /> : null}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="payment-proof-input">Constancia de pago ({PAYMENT_PROOF_ACCEPTED_FORMATS_LABEL})</label>
              <Input
                id="payment-proof-input"
                type="file"
                accept={PAYMENT_PROOF_ACCEPT}
                onChange={(event) => handleProofChange(event.target.files?.[0] ?? null)}
                data-testid="payment-proof-input"
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
              <Button type="submit" disabled={isLoading}>{isLoading ? "Registrando..." : "Registrar pago"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
