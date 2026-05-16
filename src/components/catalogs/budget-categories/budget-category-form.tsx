"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useCreateBudgetCategory, useUpdateBudgetCategory } from "@/hooks/use-catalogs";
import type { BudgetCategory, CreateBudgetCategoryDto, UpdateBudgetCategoryDto } from "@/types/catalogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BudgetCategorySchema = z.object({
  name: z.string().min(1, "El nombre es requerido").max(255, "Máximo 255 caracteres"),
  description: z.string().optional(),
});

type BudgetCategoryFormData = z.infer<typeof BudgetCategorySchema>;

interface BudgetCategoryFormProps {
  item?: BudgetCategory;
  onClose: () => void;
  onSuccess: () => void;
}

export function BudgetCategoryForm({ item, onClose, onSuccess }: BudgetCategoryFormProps) {
  const isEdit = Boolean(item);
  const { create, isLoading: createLoading } = useCreateBudgetCategory();
  const { update, isLoading: updateLoading } = useUpdateBudgetCategory(item?.id ?? "");
  const isLoading = createLoading || updateLoading;

  const [form, setForm] = useState<BudgetCategoryFormData>({
    name: item?.name ?? "",
    description: item?.description ?? "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof BudgetCategoryFormData, string>>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = BudgetCategorySchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof BudgetCategoryFormData, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof BudgetCategoryFormData;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});

    try {
      const dto = {
        name: parsed.data.name,
        description: parsed.data.description || undefined,
      };

      if (isEdit) {
        await update(dto as UpdateBudgetCategoryDto);
        toast.success("Tipo de recurso actualizado exitosamente");
      } else {
        await create(dto as CreateBudgetCategoryDto);
        toast.success("Tipo de recurso creado exitosamente");
      }

      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="name">Nombre *</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Ej: Recursos Ordinarios"
          className={errors.name ? "border-destructive" : ""}
          maxLength={255}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Descripción (opcional)</Label>
        <textarea
          id="description"
          value={form.description ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={3}
          placeholder="Descripción del tipo de recurso..."
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        />
      </div>

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
