"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useBulkMarkPaid } from "@/hooks/use-requests";
import { getBusinessDateTimeLocalValue, parseBusinessDateTimeLocalToIso } from "@/lib/business-timezone";
import { formatRequestCurrency, getApiErrorMessage, getRequestDisplayCode, getRequestPayableAmount } from "@/lib/requests";
import {
  BULK_PAYMENT_RESULT_STATUS,
  DRIVE_SOURCE_ACCOUNT,
  type BulkMarkPaidResponse,
  type BulkPaymentItemResult,
  type BulkRegisterPaymentItemInput,
  type DriveSourceAccount,
  type PaymentRequest,
} from "@/types/requests";

const BULK_PAYMENT_MAX_ITEMS = 5;

const SOURCE_ACCOUNT_LABELS: Record<DriveSourceAccount, string> = {
  [DRIVE_SOURCE_ACCOUNT.BCP_PEN]: "BCP-SOLES",
  [DRIVE_SOURCE_ACCOUNT.BCP_USD]: "BCP-DOLARES",
  [DRIVE_SOURCE_ACCOUNT.BCP_ODF]: "BCP-ODF",
  [DRIVE_SOURCE_ACCOUNT.BBVA_PEN]: "BBVA-SOLES",
  [DRIVE_SOURCE_ACCOUNT.BBVA_USD]: "BBVA-DOLARES",
};

const bulkRegisterPaymentsSchema = z.object({
  paid_at: z.string().min(1, "Indica la fecha y hora de pago."),
  source_account_key: z.enum([
    DRIVE_SOURCE_ACCOUNT.BCP_PEN,
    DRIVE_SOURCE_ACCOUNT.BCP_USD,
    DRIVE_SOURCE_ACCOUNT.BCP_ODF,
    DRIVE_SOURCE_ACCOUNT.BBVA_PEN,
    DRIVE_SOURCE_ACCOUNT.BBVA_USD,
  ], { message: "Selecciona la cuenta de origen." }),
});

type BulkRegisterPaymentsFormValues = z.infer<typeof bulkRegisterPaymentsSchema>;

interface BulkMarkPaidModalProps {
  requests: PaymentRequest[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: BulkMarkPaidResponse) => Promise<void> | void;
  prepareItems: (requests: PaymentRequest[]) => Promise<BulkRegisterPaymentItemInput[]>;
}

function createClientBatchId(): string {
  return crypto.randomUUID();
}

function getResultLabel(status: string): string {
  if (status === BULK_PAYMENT_RESULT_STATUS.SUCCESS) return "Procesado correctamente";
  if (status === BULK_PAYMENT_RESULT_STATUS.ALREADY_PROCESSED) return "Ya estaba procesado";
  return "No se pudo procesar";
}

function getItemErrorMessage(item: BulkPaymentItemResult): string | null {
  if (item.error_code === "GIOF_LEASE_FOREIGN" || item.error_code === "ACTIVE_FOREIGN_LEASE") {
    return "La solicitud tiene un lease activo de otra persona. No se registró el pago.";
  }
  if (item.error_code === "GIOF_ASSIGNMENT_VERSION_STALE" || item.error_code === "VERSION_MISMATCH") {
    return "La versión de asignación cambió. Actualiza la cola antes de reintentar.";
  }
  if (item.error_code === "INELIGIBLE_LIFECYCLE" || item.error_code === "PAYMENT_REQUEST_NOT_ELIGIBLE") {
    return "La solicitud ya no es elegible para pago.";
  }
  return item.error ?? null;
}

function mergeResults(
  previous: BulkPaymentItemResult[],
  next: BulkPaymentItemResult[],
): BulkPaymentItemResult[] {
  const byRequestId = new Map(previous.map((item) => [item.request_id, item]));
  next.forEach((item) => byRequestId.set(item.request_id, item));
  return [...byRequestId.values()];
}

export function BulkMarkPaidModal({ requests, open, onOpenChange, onSuccess, prepareItems }: BulkMarkPaidModalProps) {
  const { bulkMarkPaid } = useBulkMarkPaid();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkMarkPaidResponse | null>(null);
  const [references, setReferences] = useState<Record<string, string>>({});
  const initialBatchIdRef = useRef<string>("");
  const retryBatchIdRef = useRef<string | null>(null);
  const totalAmount = requests.reduce((total, request) => total + getRequestPayableAmount(request), 0);
  const currency = requests[0]?.currency ?? "PEN";
  const form = useForm<BulkRegisterPaymentsFormValues>({
    resolver: zodResolver(bulkRegisterPaymentsSchema),
    defaultValues: { paid_at: getBusinessDateTimeLocalValue(), source_account_key: undefined },
  });

  useEffect(() => {
    if (!open) return;
    initialBatchIdRef.current = createClientBatchId();
    retryBatchIdRef.current = null;
    form.reset({ paid_at: getBusinessDateTimeLocalValue(), source_account_key: undefined });
    setReferences(Object.fromEntries(requests.map((request) => [request.id, ""])));
    setSubmitError(null);
    setResult(null);
  }, [form, open]);

  async function runSubmission(
    targetRequests: PaymentRequest[],
    values: BulkRegisterPaymentsFormValues,
    clientBatchId: string,
  ): Promise<void> {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const prepared = await prepareItems(targetRequests);
      const preparedById = new Map(prepared.map((item) => [item.request_id, item]));
      const items = targetRequests.map((request) => {
        const credential = preparedById.get(request.id);
        if (!credential) throw new Error(`No se pudo preparar ${getRequestDisplayCode(request)}. Actualiza la cola.`);
        return {
          ...credential,
          operation_reference: references[request.id]?.trim() || undefined,
        };
      });
      const response = await bulkMarkPaid({
        client_batch_id: clientBatchId,
        paid_at: parseBusinessDateTimeLocalToIso(values.paid_at),
        source_account_key: values.source_account_key,
        items,
      });
      const mergedResults = mergeResults(result?.results ?? [], response.results);
      const mergedResponse: BulkMarkPaidResponse = {
        ...response,
        item_count: mergedResults.length,
        success_count: mergedResults.filter((item) => item.status !== BULK_PAYMENT_RESULT_STATUS.FAILED).length,
        failed_count: mergedResults.filter((item) => item.status === BULK_PAYMENT_RESULT_STATUS.FAILED).length,
        results: mergedResults,
      };
      setResult(mergedResponse);
      retryBatchIdRef.current = null;
      await onSuccess(response);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submit(values: BulkRegisterPaymentsFormValues): Promise<void> {
    if (requests.length < 1 || requests.length > BULK_PAYMENT_MAX_ITEMS) {
      setSubmitError("Selecciona entre 1 y 5 solicitudes visibles y elegibles.");
      return;
    }
    await runSubmission(requests, values, initialBatchIdRef.current);
  }

  async function retryFailed(): Promise<void> {
    if (!result) return;
    const failedIds = new Set(result.results.filter((item) => item.status === BULK_PAYMENT_RESULT_STATUS.FAILED).map((item) => item.request_id));
    const failedRequests = requests.filter((request) => failedIds.has(request.id));
    if (failedRequests.length === 0) return;
    retryBatchIdRef.current ??= createClientBatchId();
    await runSubmission(failedRequests, form.getValues(), retryBatchIdRef.current);
  }

  const failedCount = result?.results.filter((item) => item.status === BULK_PAYMENT_RESULT_STATUS.FAILED).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!isSubmitting) onOpenChange(nextOpen); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar pagos seleccionados</DialogTitle>
          <DialogDescription>
            {requests.length} solicitud{requests.length === 1 ? "" : "es"} visible{requests.length === 1 ? "" : "s"} por {formatRequestCurrency(totalAmount, currency)}. Fecha y cuenta son comunes; la referencia es opcional por solicitud.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
            <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              El lote puede terminar con resultados parciales. La constancia no es obligatoria y podrá completarse después.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField control={form.control} name="paid_at" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha efectiva del pago (hora Perú)</FormLabel>
                  <FormControl><Input type="datetime-local" {...field} data-testid="bulk-payment-paid-at-input" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="source_account_key" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuenta de origen</FormLabel>
                  <FormControl>
                    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={field.value ?? ""} onChange={field.onChange} data-testid="bulk-payment-source-account-select">
                      <option value="">Selecciona una cuenta</option>
                      {Object.entries(SOURCE_ACCOUNT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="rounded-md border">
              <div className="border-b px-3 py-2 text-sm font-medium">Solicitudes seleccionadas (máximo 5)</div>
              <div className="divide-y">
                {requests.map((request) => (
                  <div key={request.id} className="grid gap-2 px-3 py-3 md:grid-cols-[1fr_auto_1.2fr] md:items-center">
                    <span className="text-sm font-medium">{getRequestDisplayCode(request)}</span>
                    <span className="text-sm font-medium">{formatRequestCurrency(getRequestPayableAmount(request), request.currency)}</span>
                    <Input
                      value={references[request.id] ?? ""}
                      maxLength={120}
                      placeholder="Referencia opcional"
                      aria-label={`Referencia de ${getRequestDisplayCode(request)}`}
                      data-testid="bulk-payment-reference-input"
                      onChange={(event) => setReferences((current) => ({ ...current, [request.id]: event.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            {submitError ? <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive" role="alert">{submitError}</p> : null}

            {result ? (
              <div className="space-y-3 rounded-md border p-3" data-testid="bulk-payment-result-summary">
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge>Procesados: {result.success_count}</Badge>
                  <Badge variant="outline">Fallidos: {result.failed_count}</Badge>
                </div>
                <div className="space-y-2">
                  {result.results.map((item) => (
                    <div key={item.request_id} className="rounded-md border p-2 text-sm" data-testid="bulk-payment-result-row">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{getRequestDisplayCode(requests.find((request) => request.id === item.request_id) ?? { id: item.request_id } as PaymentRequest)}</span>
                        <span>{getResultLabel(item.status)}</span>
                      </div>
                      {getItemErrorMessage(item) ? <p className="mt-1 text-destructive">{getItemErrorMessage(item)}</p> : null}
                    </div>
                  ))}
                </div>
                {failedCount > 0 ? <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => void retryFailed()}>{isSubmitting ? "Reintentando..." : `Reintentar ${failedCount} fallido${failedCount === 1 ? "" : "s"}`}</Button> : null}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cerrar</Button>
              {!result ? <Button type="submit" disabled={isSubmitting || requests.length === 0 || requests.length > BULK_PAYMENT_MAX_ITEMS}>{isSubmitting ? "Registrando..." : `Registrar ${requests.length} pago${requests.length === 1 ? "" : "s"}`}</Button> : null}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
