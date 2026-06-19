"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import {
  useCreateFundingSourceType,
  useUpdateFundingSourceType,
} from "@/hooks/use-catalogs";
import type {
  CreateFundingSourceTypeDto,
  FundingSourceType,
  UpdateFundingSourceTypeDto,
} from "@/types/catalogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const FundingSourceTypeSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(100, "Máximo 100 caracteres"),
  description: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
});

type FundingSourceTypeFormData = z.infer<typeof FundingSourceTypeSchema>;

interface FundingSourceTypeFormProps {
  item?: FundingSourceType;
  onClose: () => void;
  onSuccess: () => void;
}

export function FundingSourceTypeForm({ item, onClose, onSuccess }: FundingSourceTypeFormProps) {
  const isEdit = Boolean(item);
  const { create, isLoading: createLoading } = useCreateFundingSourceType();
  const { update, isLoading: updateLoading } = useUpdateFundingSourceType(item?.id ?? "");
  const isLoading = createLoading || updateLoading;
  const [form, setForm] = useState<FundingSourceTypeFormData>({
    name: item?.name ?? "",
    description: item?.description ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FundingSourceTypeFormData, string>>>({});

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = FundingSourceTypeSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof FundingSourceTypeFormData, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FundingSourceTypeFormData;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});

    const dto = {
      name: parsed.data.name,
      description: parsed.data.description || undefined,
    };

    try {
      if (isEdit) {
        await update(dto as UpdateFundingSourceTypeDto);
        toast.success("Tipo de fuente de financiamiento actualizado");
      } else {
        await create(dto as CreateFundingSourceTypeDto);
        toast.success("Tipo de fuente de financiamiento creado");
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
        <Label htmlFor="funding-source-type-name">Nombre *</Label>
        <Input
          id="funding-source-type-name"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          placeholder="Ej: Presupuestado"
          className={errors.name ? "border-destructive" : ""}
          maxLength={100}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="funding-source-type-description">Descripción (opcional)</Label>
        <Textarea
          id="funding-source-type-description"
          value={form.description ?? ""}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          rows={3}
          placeholder="Describe cuándo usar este tipo..."
          className={errors.description ? "border-destructive" : ""}
          maxLength={500}
        />
        {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
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
