"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useUpdateFiscalYear } from "@/hooks/use-budget";
import { useAuthStore } from "@/stores/auth-store";
import { hasRoleCapability, ROLE_CAPABILITY } from "@/lib/role-capabilities";
import {
  annualUitInputSchema,
  draftUitChange,
  fiscalYearErrorMessage,
  formatAnnualUit,
} from "@/lib/fiscal-year-uit";
import type { FiscalYear } from "@/types/budget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface Props {
  fiscalYear: FiscalYear;
  onClose: () => void;
  onSuccess: () => void;
  onRefresh: () => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
}

export function FiscalYearUitForm({
  fiscalYear,
  onClose,
  onSuccess,
  onRefresh,
  onBusyChange,
}: Props) {
  const role = useAuthStore((s) => s.user?.role?.code);
  const authorized = hasRoleCapability(role, ROLE_CAPABILITY.BUDGET_ADMIN);
  const initialize =
    fiscalYear.status === "ACTIVE" && fiscalYear.annual_uit === null;
  const editable = authorized && (fiscalYear.status === "DRAFT" || initialize);
  const { update, isLoading } = useUpdateFiscalYear(fiscalYear.id);
  const pending = useRef(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const schema = z.object({
    value: initialize
      ? annualUitInputSchema
      : z.union([z.literal(""), annualUitInputSchema]),
    source: initialize
      ? z.string().trim().min(1, "Ingrese la fuente o referencia.").max(500)
      : z.string(),
    reason: initialize
      ? z.string().trim().min(1, "Ingrese el motivo para auditoría.").max(1000)
      : z.string(),
    confirmed: z
      .boolean()
      .refine(
        (value) => !initialize || value,
        "Confirme la inicialización única e inmutable.",
      ),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      value: fiscalYear.annual_uit ?? "",
      source: "",
      reason: "",
      confirmed: false,
    },
  });
  const busy = isLoading || form.formState.isSubmitting;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const submit = form.handleSubmit(async (values) => {
    if (!editable || failed) return;
    try {
      const dto = initialize
        ? {
            annual_uit: Number(values.value),
            annual_uit_source: values.source,
            annual_uit_reason: values.reason,
          }
        : draftUitChange(values.value, fiscalYear.annual_uit);
      if (Object.keys(dto).length === 0) {
        onClose();
        return;
      }
      await update(dto);
      toast.success(
        initialize
          ? "Valor UIT inicializado; no podrá reescribirse."
          : "Valor UIT actualizado",
      );
      onSuccess();
      onClose();
    } catch (cause) {
      setFailed(true);
      setError(
        `${fiscalYearErrorMessage(cause)} Cierre y revise el estado actualizado antes de intentar otra operación.`,
      );
      try {
        await onRefresh();
      } catch {
        setError(
          (message) => `${message} No se pudo actualizar; vuelva a consultar.`,
        );
      }
    }
  });

  if (!editable)
    return (
      <p>Valor UIT: {formatAnnualUit(fiscalYear.annual_uit)}. Solo lectura.</p>
    );
  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (pending.current) return;
          pending.current = true;
          void submit(event).finally(() => {
            pending.current = false;
          });
        }}
        className="space-y-4"
        aria-busy={busy}
      >
        <p>
          Año fiscal {fiscalYear.year} · {fiscalYear.status} · Valor actual:{" "}
          {formatAnnualUit(fiscalYear.annual_uit)}
        </p>
        {initialize ? (
          <p id="uit-intent">
            Inicialización única de Valor UIT en PEN. Una vez guardado no podrá
            reemplazarse, borrarse ni repetirse, incluso con el mismo valor. La
            fuente y el motivo se registran para auditoría; el servidor registra
            actor, fecha y año fiscal.
          </p>
        ) : (
          <p>
            Dejar vacío conserva el valor actual. Se requiere una UIT válida
            antes de activar el año fiscal.
          </p>
        )}
        <fieldset disabled={busy || failed} className="space-y-4">
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor UIT (PEN)</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="decimal" />
                </FormControl>
                <FormMessage role="alert" />
              </FormItem>
            )}
          />
          {initialize && (
            <>
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fuente o referencia para auditoría</FormLabel>
                    <FormControl>
                      <Input {...field} maxLength={500} />
                    </FormControl>
                    <FormMessage role="alert" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Motivo de inicialización para auditoría
                    </FormLabel>
                    <FormControl>
                      <Input {...field} maxLength={1000} />
                    </FormControl>
                    <FormMessage role="alert" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmed"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(event) =>
                          field.onChange(event.target.checked)
                        }
                        ref={field.ref}
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                    <FormLabel>
                      Confirmo que esta inicialización es única e inmutable
                    </FormLabel>
                    <FormMessage role="alert" />
                  </FormItem>
                )}
              />
            </>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cerrar
          </Button>
          <Button type="submit" disabled={busy || failed}>
            {busy
              ? "Guardando..."
              : initialize
                ? "Inicializar Valor UIT"
                : "Guardar Valor UIT"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
