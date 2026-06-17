"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBulkMarkPaid } from "@/hooks/use-requests";
import { getBusinessDateTimeLocalValue, parseBusinessDateTimeLocalToIso } from "@/lib/business-timezone";
import { formatRequestCurrency, getApiErrorMessage, getBulkPaymentResultLabel, getBulkPaymentRexanHref, getPaymentEmailStatusLabel, getPaymentRexanStatusLabel, getRequestDisplayCode, getRequestPayableAmount } from "@/lib/requests";
import type { BulkMarkPaidResponse, PaymentRequest } from "@/types/requests";

const bulkMarkPaidSchema = z.object({
  paid_at: z.string().min(1, "Indica la fecha y hora de pago."),
  operation_reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

type BulkMarkPaidFormValues = z.infer<typeof bulkMarkPaidSchema>;

interface BulkMarkPaidModalProps {
  requests: PaymentRequest[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void> | void;
}

function getDefaultPaidAtValue(): string {
  return getBusinessDateTimeLocalValue();
}

export function BulkMarkPaidModal({ requests, open, onOpenChange, onSuccess }: BulkMarkPaidModalProps) {
  const router = useRouter();
  const { bulkMarkPaid, isLoading } = useBulkMarkPaid();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkMarkPaidResponse | null>(null);
  const totalAmount = requests.reduce((total, request) => total + getRequestPayableAmount(request), 0);
  const currency = requests[0]?.currency ?? "PEN";
  const form = useForm<BulkMarkPaidFormValues>({
    resolver: zodResolver(bulkMarkPaidSchema),
    defaultValues: {
      paid_at: getDefaultPaidAtValue(),
      operation_reference: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({ paid_at: getDefaultPaidAtValue(), operation_reference: "", notes: "" });
    setSubmitError(null);
    setResult(null);
  }, [form, open]);

  async function submit(values: BulkMarkPaidFormValues) {
    setSubmitError(null);
    setResult(null);
    try {
      const response = await bulkMarkPaid({
        request_ids: requests.map((request) => request.id),
        paid_at: parseBusinessDateTimeLocalToIso(values.paid_at),
        operation_reference: values.operation_reference?.trim() || undefined,
        notes: values.notes?.trim() || undefined,
      });
      setResult(response);
      await onSuccess();

      const activatedRexanHrefs = response.results
        .filter((item) => item.status.toLowerCase() === "success" && (item.rexan?.status === "CREATED" || item.rexan?.status === "REUSED"))
        .map((item) => getBulkPaymentRexanHref(item.rexan))
        .filter((href): href is string => Boolean(href));
      if (activatedRexanHrefs.length === 1) {
        router.push(activatedRexanHrefs[0] as Route);
      }
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Marcar como pagadas</DialogTitle>
          <DialogDescription>
            {requests.length} solicitud{requests.length === 1 ? "" : "es"} seleccionada{requests.length === 1 ? "" : "s"} por {formatRequestCurrency(totalAmount, currency)}. Los montos se tomarán desde el importe pagable de cada solicitud.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Al confirmar, estas solicitudes quedarán como pagadas. Las notificaciones de pagos masivos se agruparán según la política vigente. Si falta constancia o referencia, podrás completar esos datos después.
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField control={form.control} name="paid_at" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha y hora de pago (hora Perú)</FormLabel>
                  <FormControl><Input type="datetime-local" {...field} data-testid="bulk-payment-paid-at-input" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="operation_reference" render={({ field }) => (
                <FormItem>
                  <FormLabel>Referencia de operación</FormLabel>
                  <FormControl><Input placeholder="Opcional" {...field} data-testid="bulk-payment-reference-input" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notas</FormLabel>
                <FormControl><Textarea placeholder="Opcional" {...field} data-testid="bulk-payment-notes-input" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-sm font-medium">Solicitudes seleccionadas</div>
              <div className="max-h-44 divide-y overflow-y-auto">
                {requests.map((request) => (
                  <div key={request.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span>{getRequestDisplayCode(request)}</span>
                    <span className="font-medium">{formatRequestCurrency(getRequestPayableAmount(request), request.currency)}</span>
                  </div>
                ))}
              </div>
            </div>

            {submitError && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{submitError}</p>}

            {result && (
              <div className="space-y-3 rounded-md border p-3" data-testid="bulk-payment-result-summary">
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge>Correctos: {result.success_count}</Badge>
                  <Badge variant="outline">Con incidencia: {result.failed_count}</Badge>
                </div>
                <div className="space-y-2">
                  {result.results.map((item) => {
                    const rexanHref = getBulkPaymentRexanHref(item.rexan);
                    return (
                      <div key={item.request_id} className="rounded-md border p-2 text-sm" data-testid="bulk-payment-result-row">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{item.request_id}</span>
                          <span>{getBulkPaymentResultLabel(item)}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.proof_pending && <Badge variant="outline">Falta constancia</Badge>}
                          {item.details_pending && <Badge variant="outline">Falta referencia</Badge>}
                          {item.email_status && <Badge variant="secondary">{getPaymentEmailStatusLabel(item.email_status)}</Badge>}
                          {item.rexan?.status && <Badge variant={item.rexan.status === "FAILED" ? "destructive" : "secondary"}>{getPaymentRexanStatusLabel(item.rexan.status)}</Badge>}
                          {rexanHref && <Button type="button" variant="link" size="sm" className="h-auto p-0" asChild><Link href={rexanHref as Route}>Ver REXAN</Link></Button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cerrar</Button>
              <Button type="submit" disabled={isLoading || requests.length === 0}>{isLoading ? "Marcando..." : "Marcar como pagadas"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
