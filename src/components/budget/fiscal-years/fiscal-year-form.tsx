"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import {
  useCreateFiscalYear,
  type CreateFiscalYearDto,
} from "@/hooks/use-budget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// -------------------------------------------------------
// Zod schema for fiscal year creation
// -------------------------------------------------------

const CreateFiscalYearSchema = z.object({
  year: z.number().min(2000, "El año debe ser mayor o igual a 2000").max(2100, "El año debe ser menor o igual a 2100"),
  notes: z.string().optional(),
});

type CreateFiscalYearFormData = z.infer<typeof CreateFiscalYearSchema>;

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface FiscalYearFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

// -------------------------------------------------------
// FiscalYearForm component
// -------------------------------------------------------

export function FiscalYearForm({ onClose, onSuccess }: FiscalYearFormProps) {
  const { create, isLoading } = useCreateFiscalYear();

  const [form, setForm] = useState<CreateFiscalYearDto>({
    year: new Date().getFullYear(),
    notes: "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof CreateFiscalYearDto, string>>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validar con Zod
    const parsed = CreateFiscalYearSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof CreateFiscalYearDto, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof CreateFiscalYearDto;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});

    try {
      await create(form);
      toast.success("Año fiscal creado exitosamente");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear año fiscal");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Año */}
      <div className="space-y-1">
        <Label htmlFor="year">Año *</Label>
        <Input
          id="year"
          type="number"
          min={2000}
          max={2100}
          value={form.year}
          onChange={(e) => setForm((f) => ({ ...f, year: parseInt(e.target.value, 10) || 0 }))}
          className={errors.year ? "border-destructive" : ""}
        />
        {errors.year && <p className="text-xs text-destructive">{errors.year}</p>}
      </div>

      {/* Notas */}
      <div className="space-y-1">
        <Label htmlFor="notes">Notas (opcional)</Label>
        <textarea
          id="notes"
          value={form.notes ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={3}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          placeholder="Observaciones adicionales..."
        />
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Creando..." : "Crear año fiscal"}
        </Button>
      </div>
    </form>
  );
}
