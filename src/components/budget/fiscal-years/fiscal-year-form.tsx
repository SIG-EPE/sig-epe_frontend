"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { useCreateFiscalYear } from "@/hooks/use-budget";
import {
  annualUitInputSchema,
  draftUitChange,
  fiscalYearErrorMessage,
} from "@/lib/fiscal-year-uit";
import { useAuthStore } from "@/stores/auth-store";
import { ROLE_CAPABILITY, hasRoleCapability } from "@/lib/role-capabilities";
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

const schema = z.object({
  year: z
    .string()
    .regex(/^\d{4}$/, "Ingrese un año válido.")
    .refine(
      (value) => Number(value) >= 2020 && Number(value) <= 2100,
      "El año debe estar entre 2020 y 2100.",
    ),
  uit: z.union([z.literal(""), annualUitInputSchema]),
  notes: z.string(),
});
interface FiscalYearFormProps {
  onClose: () => void;
  onSuccess: () => void;
  onRefresh?: () => void;
  onBusyChange?: (busy: boolean) => void;
}

export function FiscalYearForm({
  onClose,
  onSuccess,
  onRefresh,
  onBusyChange,
}: FiscalYearFormProps) {
  const { create, isLoading } = useCreateFiscalYear();
  const role = useAuthStore((s) => s.user?.role?.code);
  const authorized = hasRoleCapability(role, ROLE_CAPABILITY.BUDGET_ADMIN);
  const pending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { year: "", uit: "", notes: "" },
  });
  const busy = isLoading || form.formState.isSubmitting;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const submit = form.handleSubmit(async (values) => {
    if (!authorized || error) return;
    try {
      await create({
        year: Number(values.year),
        notes: values.notes,
        ...draftUitChange(values.uit),
      });
      toast.success("Año fiscal creado exitosamente");
      onSuccess();
      onClose();
    } catch (cause) {
      setError(
        `${fiscalYearErrorMessage(cause)} Cierre y actualice la lista antes de volver a crear.`,
      );
      onRefresh?.();
    }
  });
  if (!authorized)
    return <p>No tienes permisos para administrar años fiscales.</p>;
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
        <fieldset disabled={busy || Boolean(error)} className="space-y-4">
          <FormField
            control={form.control}
            name="year"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Año *</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="numeric" />
                </FormControl>
                <FormMessage role="alert" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="uit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valor UIT (PEN, opcional)</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="decimal" />
                </FormControl>
                <FormMessage role="alert" />
              </FormItem>
            )}
          />
          <p>
            Sin valor, se crea sin UIT configurada. Debe configurarla antes de
            activar; no se usa un valor predeterminado.
          </p>
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notas (opcional)</FormLabel>
                <FormControl>
                  <textarea
                    {...field}
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 md:text-sm"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || Boolean(error)}>
            {busy ? "Creando..." : "Crear año fiscal"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
