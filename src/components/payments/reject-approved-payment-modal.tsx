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
import {
  canRejectBankPayment,
  getApiErrorMessage,
  getBankPaymentRejectionErrorMessage,
  rejectBankPayment,
} from "@/lib/requests";
import { REQUEST_PAYMENT_STATUS, REQUEST_STATUS } from "@/types/requests";
import { GIOF_WORK_POOL } from "@/types/giof-work";
import type {
  PaymentRequest,
  RejectApprovedPaymentResponse,
  RejectBankPaymentResponse,
} from "@/types/requests";
import type { GiofWorkLease } from "@/types/giof-work";
import { useAuthStore } from "@/stores/auth-store";

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

interface BankRejectionSession {
  controller: AbortController;
  isCurrent: () => boolean;
}

interface RejectApprovedPaymentModalProps {
  bankIntent?: boolean;
  onBankSuccess?: (result: RejectBankPaymentResponse) => Promise<void> | void;
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
  bankIntent = false,
  onBankSuccess,
  request,
  lease,
  open,
  onOpenChange,
  onSuccess,
  onFailureRefresh,
}: RejectApprovedPaymentModalProps) {
  const { rejectApprovedPayment, isLoading: approvedLoading } = useRejectApprovedPayment();
  const [bankLoading, setBankLoading] = useState(false);
  const [bankAttempted, setBankAttempted] = useState(false);
  const isLoading = approvedLoading || bankLoading;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const bankSessionRef = useRef<BankRejectionSession | null>(null);
  const currentModalRef = useRef({ open, bankIntent, request, onOpenChange });
  currentModalRef.current = { open, bankIntent, request, onOpenChange };
  const form = useForm<RejectApprovedPaymentFormValues>({
    resolver: zodResolver(bankIntent
      ? rejectApprovedPaymentSchema.extend({ confirmation: z.string() })
      : rejectApprovedPaymentSchema),
    defaultValues: { reason: "", confirmation: "" },
  });
  const reasonLength = form.watch("reason").length;

  useEffect(() => {
    if (bankIntent || !open || !request) return;
    form.reset({ reason: "", confirmation: "" });
    setSubmitError(null);
    setBankAttempted(false);
    submittingRef.current = false;
  }, [bankIntent, form, open, request]);

  const bankRequestId = bankIntent ? request?.id : undefined;
  const bankPaymentId = bankIntent ? request?.payment?.id : undefined;
  const bankPaymentStatus = bankIntent ? request?.payment?.status : undefined;
  useEffect(() => {
    if (!bankIntent) return;
    setBankLoading(false);
    setBankAttempted(false);
    setSubmitError(null);
    submittingRef.current = false;
    form.reset({ reason: "", confirmation: "" });
    if (!open || !currentModalRef.current.request) return;
    const actor = useAuthStore.getState().user;
    const actorId = actor?.id;
    const actorRole = actor?.role?.code;
    const controller = new AbortController();
    const session = {
      controller,
      isCurrent: (): boolean => {
        const current = useAuthStore.getState().user;
        const modal = currentModalRef.current;
        return (
          bankSessionRef.current === session &&
          !controller.signal.aborted &&
          modal.open && modal.bankIntent && Boolean(actorId) &&
          current?.id === actorId && current?.role?.code === actorRole &&
          modal.request !== null &&
          modal.request.id === bankRequestId &&
          modal.request.payment?.id === bankPaymentId &&
          canRejectBankPayment(modal.request, current?.role?.code)
        );
      },
    };
    bankSessionRef.current = session;
    const invalidate = (): void => {
      if (bankSessionRef.current !== session || session.isCurrent()) return;
      bankSessionRef.current = null;
      controller.abort();
      form.reset({ reason: "", confirmation: "" });
      setSubmitError(null);
      setBankAttempted(false);
      setBankLoading(false);
      submittingRef.current = false;
      currentModalRef.current.onOpenChange(false);
    };
    invalidate();
    // Invalida incluso A→logout→A entre renders; renovar el JWT no cambia el actor.
    const unsubscribe = useAuthStore.subscribe(invalidate);
    return () => {
      unsubscribe();
      if (bankSessionRef.current === session) bankSessionRef.current = null;
      controller.abort();
    };
  }, [bankIntent, open, bankRequestId, bankPaymentId, bankPaymentStatus, form]);

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && (isLoading || submittingRef.current)) return;
    onOpenChange(nextOpen);
  }

  async function submit(values: RejectApprovedPaymentFormValues): Promise<void> {
    const bankSession = bankSessionRef.current;
    if (submittingRef.current || !request || (bankIntent && bankAttempted)) return;
    if (bankIntent && !bankSession?.isCurrent()) return;
    if (bankIntent && (request.status !== REQUEST_STATUS.PAID ||
      request.payment?.status !== REQUEST_PAYMENT_STATUS.REGISTERED)) return;
    if (!bankIntent && !lease) {
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
      if (bankIntent) {
        setBankLoading(true);
        setBankAttempted(true);
        const version = request.giof_work?.pool === GIOF_WORK_POOL.PAYMENT
          ? request.giof_work.assignmentVersion : undefined;
        const result = await rejectBankPayment(
          request.id,
          { reason: values.reason.trim() },
          version,
          bankSession!.controller.signal,
        );
        if (!bankSession!.isCurrent()) return;
        toast.success("Pago rechazado por el banco. Notificación programada para el solicitante.");
        // Un fallo de refresco no convierte un comando confirmado en un fallo bancario.
        try {
          await onBankSuccess?.(result);
        } catch {
          if (!bankSession!.isCurrent()) return;
          toast.error("El rechazo fue confirmado. Actualiza la cola para ver el estado actual.");
        }
      } else {
        const result = await rejectApprovedPayment(
          request.id,
          { reason: values.reason.trim() },
          lease!,
        );
        await onSuccess(result);
        toast.success("Pago rechazado.");
      }
      if (bankIntent && !bankSession!.isCurrent()) return;
      form.reset({ reason: "", confirmation: "" });
      onOpenChange(false);
    } catch (error) {
      if (bankIntent && !bankSession!.isCurrent()) return;
      setSubmitError(bankIntent
        ? `${getBankPaymentRejectionErrorMessage(error)} Actualiza para verificar el resultado antes de volver a intentar.`
        : getApiErrorMessage(error));
      try {
        await onFailureRefresh?.(error);
      } catch {
        // Conserva el aviso original si la cola está temporalmente inaccesible.
      }
    } finally {
      if (!bankIntent || bankSession?.isCurrent()) {
        setBankLoading(false);
        submittingRef.current = false;
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent closeDisabled={isLoading || submittingRef.current}>
        <DialogHeader>
          <DialogTitle>{bankIntent ? "Rechazar por el banco" : "Rechazar pago"}</DialogTitle>
          <DialogDescription>
            {bankIntent ? "El pago se marcará rechazado por el banco. Los registros, montos originales y constancia se conservarán; la aprobación de la solicitud no cambiará. Se programará una notificación para que el solicitante genere una nueva solicitud." : <>Esta acción es terminal: la solicitud saldrá de pagos pendientes y
            liberará su reserva presupuestal. No registra un pago y no puede
            reabrirse desde esta acción.</>}
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
                {bankIntent ? "Confirma solo si el banco rechazó este pago. El registro quedará histórico y no podrá reactivarse desde esta acción." : <>Confirma solo si el pago no puede realizarse. Esta acción no es
                una observación ni un rechazo de revisión.</>}
              </p>
              {!bankIntent && <FormField
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
              />}
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
              <Button type="submit" variant="destructive" disabled={isLoading || (bankIntent && bankAttempted)}>
                {isLoading ? "Rechazando..." : bankIntent ? "Confirmar rechazo" : "Rechazar pago"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
