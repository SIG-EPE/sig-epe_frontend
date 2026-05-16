"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRegisterPayment } from "@/hooks/use-requests";
import { PAYMENT_PROOF_ACCEPT, formatRequestCurrency, getApiErrorMessage, validatePaymentProofFile } from "@/lib/requests";
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
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
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
      amount_paid: request?.requested_amount ?? 0,
      bank_commission: undefined,
      notes: "",
    },
  });

  function handleProofChange(file: File | null) {
    setProofFile(file);
    setProofError(validatePaymentProofFile(file));
  }

  useEffect(() => {
    if (!open || !request) return;
    form.reset({
      paid_at: getDefaultPaidAtValue(),
      operation_reference: "",
      amount_paid: request.requested_amount,
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

    const input: RegisterPaymentInput = {
      paid_at: new Date(values.paid_at).toISOString(),
      operation_reference: values.operation_reference.trim(),
      amount_paid: values.amount_paid,
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
        amount_paid: request.requested_amount,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            {request ? `Solicitud ${request.request_code ?? request.sequential_number ?? request.id} por ${formatRequestCurrency(Number(request.requested_amount), request.currency)}` : "Completa los datos del telecrédito."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField control={form.control} name="paid_at" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha y hora de pago</FormLabel>
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
                  <FormControl><Input type="number" min="0" step="0.01" {...field} data-testid="payment-amount-input" /></FormControl>
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
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="payment-proof-input">Constancia PDF</label>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>{isLoading ? "Registrando..." : "Registrar pago"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
