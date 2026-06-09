"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useCreateBudgetProgram, useUpdateBudgetProgram } from "@/hooks/use-catalogs";
import type { BudgetProgram, CreateBudgetProgramDto, UpdateBudgetProgramDto } from "@/types/catalogs";
import { PLANNING_TYPE_LABELS, PLANNING_TYPES, type PlanningType } from "@/lib/planning-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TerritorySelector } from "@/components/shared/territory-selector";

// -------------------------------------------------------
// Zod schema
// -------------------------------------------------------

const BudgetProgramSchema = z.object({
  code: z.string().min(1, "El código es requerido").max(50, "Máximo 50 caracteres"),
  name: z.string().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  planning_type: z.enum(PLANNING_TYPES).optional(),
  territory_id: z.string().optional(),
});

type BudgetProgramFormData = z.infer<typeof BudgetProgramSchema>;

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface BudgetProgramFormProps {
  item?: BudgetProgram;
  onClose: () => void;
  onSuccess: () => void;
}

// -------------------------------------------------------
// BudgetProgramForm component
// -------------------------------------------------------

export function BudgetProgramForm({ item, onClose, onSuccess }: BudgetProgramFormProps) {
  const isEdit = Boolean(item);
  const { create, isLoading: createLoading } = useCreateBudgetProgram();
  const { update, isLoading: updateLoading } = useUpdateBudgetProgram(item?.id ?? "");
  const isLoading = createLoading || updateLoading;

  const [form, setForm] = useState<BudgetProgramFormData>({
    code: item?.code ?? "",
    name: item?.name ?? "",
    planning_type: (item?.planningType as PlanningType) ?? undefined,
    territory_id: item?.territory_id ?? undefined,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof BudgetProgramFormData, string>>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = BudgetProgramSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof BudgetProgramFormData, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof BudgetProgramFormData;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});

    try {
      // Mapeamos al nombre de campo que espera el backend (camelCase para planningType)
      const dto = {
        code: parsed.data.code,
        name: parsed.data.name,
        planningType: parsed.data.planning_type || undefined,
        territory_id: parsed.data.territory_id || undefined,
      };

      if (isEdit) {
        await update(dto as UpdateBudgetProgramDto);
        toast.success("Programa actualizado exitosamente");
      } else {
        await create(dto as CreateBudgetProgramDto);
        toast.success("Programa creado exitosamente");
      }

      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    }
  };

  const selectClass = (hasError?: boolean) =>
    `flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm${hasError ? " border-destructive" : ""}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Código */}
      <div className="space-y-1">
        <Label htmlFor="code">Código *</Label>
        <Input
          id="code"
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          placeholder="Ej: PRG-001"
          className={errors.code ? "border-destructive" : ""}
          maxLength={50}
        />
        {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
      </div>

      {/* Nombre */}
      <div className="space-y-1">
        <Label htmlFor="name">Nombre *</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Nombre del programa"
          className={errors.name ? "border-destructive" : ""}
          maxLength={200}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      {/* Tipo de planificación */}
      <div className="space-y-1">
        <Label htmlFor="planning_type">Tipo de planificación (opcional)</Label>
        <select
          id="planning_type"
          value={form.planning_type ?? ""}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              planning_type: (e.target.value as PlanningType) || undefined,
            }))
          }
          className={selectClass()}
        >
          <option value="">Sin tipo</option>
          {PLANNING_TYPES.map((t) => (
            <option key={t} value={t}>
              {PLANNING_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {/* Territorio */}
      <div className="space-y-1">
        <TerritorySelector
          value={form.territory_id}
          onChange={(val) => setForm((f) => ({ ...f, territory_id: val || undefined }))}
          mode="persisted"
          showLabel={true}
        />
      </div>

      {/* Acciones */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
