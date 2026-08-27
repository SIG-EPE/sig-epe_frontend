"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PaymentAllocationProofCoverage } from "@/components/payments/payment-allocation-proof-coverage";
import {
  PaymentProofField,
  PaymentSourceAccountSelect,
} from "@/components/payments/payment-form-sections";
import { useUploadNavigationGuard } from "@/hooks/use-upload-navigation-guard";
import { useRegisterPayment } from "@/hooks/use-requests";
import {
  formatBusinessDateShortDot,
  getBusinessDateTimeLocalValue,
  parseBusinessDateTimeLocalToIso,
} from "@/lib/business-timezone";
import {
  formatRequestCurrency,
  getApiErrorMessage,
  getRequestPayableAmount,
  isGiofOperationalContextError,
  isRexanExcessRequest,
  toMoneyCents,
  validatePaymentProofFile,
} from "@/lib/requests";
import {
  DRIVE_SOURCE_ACCOUNT,
  type PaymentRequest,
  type RegisterPaymentInput,
  type RegisterPaymentResponse,
} from "@/types/requests";
import { isGiofLeaseCurrent } from "@/lib/giof-work-lease-session";
import { GIOF_WORK_POOL, type GiofWorkLease } from "@/types/giof-work";

const paidAtSchema = z
  .string()
  .min(1, "Indica la fecha y hora de pago.")
  .superRefine((value, context) => {
    if (!value) return;
    try {
      const paidAt = new Date(parseBusinessDateTimeLocalToIso(value));
      if (paidAt.getTime() > Date.now()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "La fecha efectiva no puede ser posterior a la hora actual en Perú. El servidor realizará la validación definitiva.",
        });
      }
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ingresa una fecha y hora de pago válidas.",
      });
    }
  });

const registerPaymentSchema = z.object({
  paid_at: paidAtSchema,
  source_account_key: z.enum([
    DRIVE_SOURCE_ACCOUNT.BCP_PEN,
    DRIVE_SOURCE_ACCOUNT.BCP_USD,
    DRIVE_SOURCE_ACCOUNT.BCP_ODF,
    DRIVE_SOURCE_ACCOUNT.BBVA_PEN,
    DRIVE_SOURCE_ACCOUNT.BBVA_USD,
  ]),
  operation_reference: z
    .string()
    .trim()
    .min(3, "Ingresa la referencia de operación o telecrédito."),
  bank_commission: z.coerce
    .number()
    .min(0, "La comisión no puede ser negativa.")
    .optional(),
  notes: z.string().trim().optional(),
});

type RegisterPaymentFormValues = z.infer<typeof registerPaymentSchema>;

interface RegisterPaymentModalProps {
  request: PaymentRequest | null;
  open: boolean;
  operationalContext?: GiofWorkLease | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: RegisterPaymentResponse) => Promise<void> | void;
  onOperationalContextInvalid?: () => Promise<void> | void;
}

function getDefaultPaidAtValue(): string {
  return getBusinessDateTimeLocalValue();
}

function getDestinationDatePreview(value: string): string | null {
  try {
    return formatBusinessDateShortDot(parseBusinessDateTimeLocalToIso(value));
  } catch {
    return null;
  }
}

export function RegisterPaymentModal({
  request,
  open,
  operationalContext,
  onOpenChange,
  onSuccess,
  onOperationalContextInvalid,
}: RegisterPaymentModalProps) {
  const { registerPayment, isLoading } = useRegisterPayment();
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<RegisterPaymentFormValues>({
    resolver: zodResolver(registerPaymentSchema),
    defaultValues: {
      paid_at: getDefaultPaidAtValue(),
      source_account_key: undefined,
      operation_reference: "",
      bank_commission: undefined,
      notes: "",
    },
  });
  const isRexanExcess = request ? isRexanExcessRequest(request) : false;
  const payableAmount = request ? getRequestPayableAmount(request) : 0;
  const paidAtValue = form.watch("paid_at");
  const destinationDatePreview = getDestinationDatePreview(paidAtValue);
  const hasOperationalContext = Boolean(
    request?.giof_work
      && isGiofLeaseCurrent(operationalContext, {
        requestId: request.id,
        pool: GIOF_WORK_POOL.PAYMENT,
        assignmentVersion: request.giof_work.assignmentVersion,
        ownerId: request.giof_work.assigneeId,
      }),
  );
  const uploadWarningMessage =
    "No cierres esta ventana mientras se carga el archivo";

  useUploadNavigationGuard({
    active: isLoading,
    message:
      "Hay una constancia de pago cargándose. Si sales o actualizas la página, la carga en curso puede cancelarse.",
  });

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
      source_account_key: undefined,
      operation_reference: "",
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
    if (!hasOperationalContext || !operationalContext) {
      setSubmitError("La sesión de pago no está vigente. Cierra esta ventana, actualiza la cola y vuelve a Procesar.");
      return;
    }
    const amountPaid = getRequestPayableAmount(request);
    const amountPaidCents = toMoneyCents(amountPaid) ?? 0;
    const payableAmountCents =
      toMoneyCents(getRequestPayableAmount(request)) ?? 0;
    if (amountPaidCents !== payableAmountCents || payableAmountCents <= 0) {
      setSubmitError("No se pudo determinar el importe completo de la solicitud. Actualiza la cola antes de registrar el pago.");
      return;
    }

    const input: RegisterPaymentInput = {
      paid_at: parseBusinessDateTimeLocalToIso(values.paid_at),
      source_account_key: values.source_account_key,
      operation_reference: values.operation_reference.trim(),
      amount_paid: amountPaid,
      bank_commission: values.bank_commission,
      notes: values.notes?.trim() || undefined,
      proof: proofFile,
    };

    try {
      const result = await registerPayment(request.id, input, operationalContext);
      await onSuccess(result);
      form.reset({
        paid_at: getDefaultPaidAtValue(),
        source_account_key: undefined,
        operation_reference: "",
        bank_commission: undefined,
        notes: "",
      });
      setProofFile(null);
      onOpenChange(false);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
      if (isGiofOperationalContextError(error)) {
        await onOperationalContextInvalid?.();
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl" closeDisabled={isLoading}>
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            {request
              ? `Solicitud ${request.request_code ?? request.sequential_number ?? request.id} por ${formatRequestCurrency(payableAmount, request.currency)}${isRexanExcess ? " · Saldo REXAN" : ""}`
              : "Completa los datos del telecrédito."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form noValidate className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
            <DialogBody className="space-y-6 pr-1">
            <fieldset className="space-y-4 rounded-md border p-4">
              <legend className="px-1 text-sm font-semibold">Datos de la transferencia</legend>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="paid_at"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha efectiva del pago (hora Perú)</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        {...field}
                        required
                        max={getBusinessDateTimeLocalValue()}
                        data-testid="payment-paid-at-input"
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-muted-foreground">
                      Puedes indicar un pago anterior. No ingreses una hora futura; el servidor aplicará la validación definitiva.
                    </p>
                    {destinationDatePreview && (
                      <p className="text-xs text-muted-foreground" data-testid="payment-destination-date-preview">
                        Fecha de destino (informativa): <span className="font-medium text-foreground">{destinationDatePreview}</span>
                      </p>
                    )}
                    <div className="rounded-md border bg-muted/20 px-3 py-2">
                      <p className="text-xs font-medium">Registrado en SIG-EPE</p>
                      <p className="text-xs text-muted-foreground">
                        Se genera automáticamente con el reloj del servidor al enviar y determina la clasificación operativa. No es editable.
                      </p>
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="operation_reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referencia de operación</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Telecrédito u operación bancaria"
                        {...field}
                        data-testid="payment-reference-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="source_account_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuenta de origen Enseña Perú</FormLabel>
                    <FormControl>
                      <PaymentSourceAccountSelect
                        id="payment-source-account"
                        value={field.value}
                        required
                        testId="payment-source-account-select"
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2 rounded-md border bg-muted/20 px-3 py-2">
                <p className="text-sm font-medium">Importe completo</p>
                <p className="text-base font-semibold">{formatRequestCurrency(payableAmount, request?.currency ?? "PEN")}</p>
                <p className="text-xs text-muted-foreground">Se registrará un único pago por el total. No se admiten pagos parciales.</p>
              </div>
              <FormField
                control={form.control}
                name="bank_commission"
                render={({ field }) => (
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
                        data-testid="payment-commission-input"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            </fieldset>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Opcional"
                      {...field}
                      data-testid="payment-notes-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {request?.allocations?.length ? (
              <PaymentAllocationProofCoverage
                request={request}
                compact
                mode="register-general-proof"
              />
            ) : null}
            <PaymentProofField
              id="payment-proof-input"
              required
              error={proofError}
              errorId="payment-proof-error"
              testId="payment-proof-input"
              autoFocus
              onChange={handleProofChange}
            />
            {!hasOperationalContext && (
              <p role="alert" className="rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
                La sesión operativa no está vigente. Cierra esta ventana, actualiza la cola y vuelve a Procesar el pago.
              </p>
            )}
            {submitError && (
              <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
                {submitError}
              </p>
            )}
            {isLoading && (
              <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-amber-950 dark:text-amber-100">
                  {uploadWarningMessage}
                </AlertDescription>
              </Alert>
            )}
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading || !hasOperationalContext}>
                {isLoading ? "Registrando..." : "Registrar pago"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
