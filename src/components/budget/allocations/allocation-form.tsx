"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import {
  useCreateFundingSourceAllocation,
  useUpdateFundingSourceAllocation,
  useFundingSources,
  type FundingSourceAllocation,
  type CreateFundingSourceAllocationDto,
  type UpdateFundingSourceAllocationDto,
} from "@/hooks/use-budget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

// -------------------------------------------------------
// Zod schema
// -------------------------------------------------------

const AllocationSchema = z.object({
  funding_source_id: z.string().min(1, "La fuente de financiamiento es requerida"),
  total_contribution: z
    .number({ invalid_type_error: "El monto es requerido" })
    .min(0, "El monto no puede ser negativo"),
  notes: z.string().optional(),
});

type AllocationFormData = z.infer<typeof AllocationSchema>;

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface AllocationFormProps {
  fiscalYearId: string;
  existingAllocation?: FundingSourceAllocation;
  onClose: () => void;
  onSuccess: () => void;
}

// -------------------------------------------------------
// AllocationForm component
// -------------------------------------------------------

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

export function AllocationForm({
  fiscalYearId,
  existingAllocation,
  onClose,
  onSuccess,
}: AllocationFormProps) {
  const isEditing = !!existingAllocation;

  const { create, isLoading: creating } = useCreateFundingSourceAllocation();
  const { update, isLoading: updating } = useUpdateFundingSourceAllocation(
    existingAllocation?.id ?? ""
  );
  const { data: partners, isLoading: partnersLoading } = useFundingSources();

  const isLoading = creating || updating;

  const [form, setForm] = useState<AllocationFormData>({
    funding_source_id: existingAllocation?.funding_source_id ?? "",
    total_contribution: existingAllocation?.total_contribution ?? 0,
    notes: existingAllocation?.notes ?? "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof AllocationFormData, string>>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = AllocationSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof AllocationFormData, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof AllocationFormData;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      // Scroll al primer campo con error
      setTimeout(() => {
        document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    setErrors({});

    try {
      if (isEditing) {
        const dto: UpdateFundingSourceAllocationDto = {
          total_contribution: parsed.data.total_contribution,
          notes: parsed.data.notes,
        };
        await update(dto);
        toast.success("Aporte actualizado exitosamente");
      } else {
        const dto: CreateFundingSourceAllocationDto = {
          fiscal_year_id: fiscalYearId,
          funding_source_id: parsed.data.funding_source_id,
          total_contribution: parsed.data.total_contribution,
          notes: parsed.data.notes,
        };
        await create(dto);
        toast.success("Aporte registrado exitosamente");
      }
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al guardar aporte"
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Socio */}
      {!isEditing && (
        <div className="space-y-1" data-error={!!errors.funding_source_id || undefined}>
          <Label htmlFor="funding_source_id">Fuente de financiamiento *</Label>
          {partnersLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <select
              id="funding_source_id"
              value={form.funding_source_id}
              onChange={(e) => {
                setForm((f) => ({ ...f, funding_source_id: e.target.value }));
                setErrors((prev) => ({ ...prev, funding_source_id: undefined }));
              }}
              className={`${SELECT_CLASS} ${errors.funding_source_id ? "border-destructive" : ""}`}
              disabled={isLoading}
            >
              <option value="">Seleccionar fuente...</option>
              {partners
                ?.filter((p) => p.is_active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          )}
          {errors.funding_source_id && (
            <p className="text-xs text-destructive">{errors.funding_source_id}</p>
          )}
        </div>
      )}

      {/* Monto total */}
      <div className="space-y-1" data-error={!!errors.total_contribution || undefined}>
        <Label htmlFor="total_contribution">Monto Total (S/) *</Label>
        <Input
          id="total_contribution"
          type="number"
          min={0}
          step="0.01"
          value={form.total_contribution}
          onChange={(e) => {
            setForm((f) => ({
              ...f,
              total_contribution: parseFloat(e.target.value) || 0,
            }));
            setErrors((prev) => ({ ...prev, total_contribution: undefined }));
          }}
          className={errors.total_contribution ? "border-destructive" : ""}
          disabled={isLoading}
        />
        {errors.total_contribution && (
          <p className="text-xs text-destructive">{errors.total_contribution}</p>
        )}
      </div>

      {/* Notas */}
      <div className="space-y-1">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <textarea
          id="notes"
          value={form.notes ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={3}
          disabled={isLoading}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          placeholder="Ej. Convenio USAID 2026 — aprobado en sesión de directorio"
        />
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading
            ? isEditing
              ? "Guardando..."
              : "Registrando..."
            : isEditing
            ? "Guardar cambios"
            : "Registrar aporte"}
        </Button>
      </div>
    </form>
  );
}
