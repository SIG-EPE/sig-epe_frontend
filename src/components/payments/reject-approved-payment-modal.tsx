"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
import { useRejectApprovedPayment } from "@/hooks/use-requests";
import { getApiErrorMessage } from "@/lib/requests";
import type {
  PaymentRequest,
  RejectApprovedPaymentResponse,
} from "@/types/requests";
import type { GiofWorkLease } from "@/types/giof-work";

export const PAYMENT_REJECTION_REASON_MAX_LENGTH = 1000;
const PAYMENT_REJECTION_CONFIRMATION = "RECHAZAR";

const rejectApprovedPaymentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Ingresa el motivo del rechazo.")
    .max(
      PAYMENT_REJECTION_REASON_MAX_LENGTH,
      `El motivo admite máximo ${PAYMENT_REJECTION_REASON_MAX_LENGTH} caracteres.`,
    ),
  confirmation: z
    .string()
    .refine(
      (value): boolean => value === PAYMENT_REJECTION_CONFIRMATION,
      "Escribe RECHAZAR exactamente para confirmar.",
    ),
});

type RejectApprovedPaymentFormValues = z.infer<
  typeof rejectApprovedPaymentSchema
>;

interface RejectApprovedPaymentModalProps {
  request: PaymentRequest | null;
  lease: GiofWorkLease | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (
    result: RejectApprovedPaymentResponse,
  ) => Promise<void> | void;
  onFailureRefresh?: (error: unknown) => Promise<void> | void;
}

export function RejectApprovedPaymentModal({
  request,
  lease,
  open,
  onOpenChange,
  onSuccess,
  onFailureRefresh,
}: RejectApprovedPaymentModalProps) {
  const { rejectApprovedPayment, isLoading } = useRejectApprovedPayment();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const form = useForm<RejectApprovedPaymentFormValues>({
    resolver: zodResolver(rejectApprovedPaymentSchema),
    defaultValues: { reason: "", confirmation: "" },
  });
  const reasonLength = form.watch("reason").length;

  useEffect(() => {
    if (!open || !request) return;
    form.reset({ reason: "", confirmation: "" });
    setSubmitError(null);
    submittingRef.current = false;
  }, [form, open, request]);

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && (isLoading || submittingRef.current)) return;
    onOpenChange(nextOpen);
  }

  async function submit(values: RejectApprovedPaymentFormValues): Promise<void> {
    if (submittingRef.current || !request) return;
    if (!lease) {
      const error = new Error(
        "La sesión PAYMENT no está vigente. Actualiza la cola y vuelve a intentar.",
      );
      setSubmitError(error.message);
      await onFailureRefresh?.(error);
      return;
    }
    submittingRef.current = true;
    setSubmitError(null);
    try {
      const result = await rejectApprovedPayment(
        request.id,
        { reason: values.reason.trim() },
        lease,
      );
      await onSuccess(result);
      toast.success("Pago rechazado.");
      form.reset({ reason: "", confirmation: "" });
      onOpenChange(false);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
      await onFailureRefresh?.(error);
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent closeDisabled={isLoading || submittingRef.current}>
        <DialogHeader>
          <DialogTitle>Rechazar pago</DialogTitle>
          <DialogDescription>
            Esta acción es terminal: la solicitud saldrá de pagos pendientes y
            liberará su reserva presupuestal. No registra un pago y no puede
            reabrirse desde esta acción.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            className="flex min-h-0 flex-1 flex-col gap-4"
            onSubmit={form.handleSubmit(submit)}
          >
            <DialogBody className="space-y-4 pr-1">
              <p className="text-sm font-medium">
                {request?.request_code ??
                  request?.sequential_number ??
                  request?.id ??
                  "Solicitud"}
              </p>
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-3">
                      <FormLabel>Motivo del rechazo</FormLabel>
                      <span
                        className="text-xs text-muted-foreground"
                        aria-live="polite"
                      >
                        {reasonLength}/{PAYMENT_REJECTION_REASON_MAX_LENGTH}
                      </span>
                    </div>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={5}
                        data-autofocus
                        aria-describedby="payment-rejection-consequence"
                      />
                    </FormControl>
                    <FormMessage role="alert" />
                  </FormItem>
                )}
              />
              <p
                id="payment-rejection-consequence"
                className="rounded-md border border-destructive/40 p-3 text-sm"
              >
                Confirma solo si el pago no puede realizarse. Esta acción no es
                una observación ni un rechazo de revisión.
              </p>
              <FormField
                control={form.control}
                name="confirmation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Escribe RECHAZAR para confirmar</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete="off" />
                    </FormControl>
                    <FormMessage role="alert" />
                  </FormItem>
                )}
              />
              {submitError ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
                >
                  {submitError}
                </p>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isLoading}
                onClick={() => handleOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={isLoading}>
                {isLoading ? "Rechazando..." : "Rechazar pago"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
