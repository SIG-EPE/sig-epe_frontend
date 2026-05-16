"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useCreateFundingSource, useUpdateFundingSource, useFundingSourceTypes } from "@/hooks/use-catalogs";
import type { FundingSource, CreateFundingSourceDto, UpdateFundingSourceDto } from "@/types/catalogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FundingSourceSchema = z.object({
  code: z.string().min(1, "El código es requerido").max(50, "Máximo 50 caracteres"),
  name: z.string().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  description: z.string().optional(),
  fundingSourceTypeId: z.string().min(1, "El tipo de fuente es requerido"),
});

type FundingSourceFormData = z.infer<typeof FundingSourceSchema>;

interface FundingSourceFormProps {
  item?: FundingSource;
  onClose: () => void;
  onSuccess: () => void;
}

export function FundingSourceForm({ item, onClose, onSuccess }: FundingSourceFormProps) {
  const isEdit = Boolean(item);
  const { create, isLoading: createLoading } = useCreateFundingSource();
  const { update, isLoading: updateLoading } = useUpdateFundingSource(item?.id ?? "");
  const { data: fundingSourceTypes, isLoading: typesLoading } = useFundingSourceTypes();
  const isLoading = createLoading || updateLoading;

  const [form, setForm] = useState<FundingSourceFormData>({
    code: item?.code ?? "",
    name: item?.name ?? "",
    description: item?.description ?? "",
    fundingSourceTypeId: item?.fundingSourceType?.id ?? "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof FundingSourceFormData, string>>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = FundingSourceSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof FundingSourceFormData, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FundingSourceFormData;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});

    try {
      const dto = {
        code: parsed.data.code,
        name: parsed.data.name,
        description: parsed.data.description || undefined,
        fundingSourceTypeId: parsed.data.fundingSourceTypeId,
      };

      if (isEdit) {
        await update(dto as UpdateFundingSourceDto);
        toast.success("Fuente de financiamiento actualizada exitosamente");
      } else {
        await create(dto as CreateFundingSourceDto);
        toast.success("Fuente de financiamiento creada exitosamente");
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
        <Label htmlFor="fundingSourceTypeId">Tipo de Fuente *</Label>
        <Select
          value={form.fundingSourceTypeId}
          onValueChange={(v) => setForm((f) => ({ ...f, fundingSourceTypeId: v }))}
          disabled={typesLoading}
        >
          <SelectTrigger className={errors.fundingSourceTypeId ? "border-destructive" : ""}>
            <SelectValue placeholder="Seleccionar tipo..." />
          </SelectTrigger>
          <SelectContent>
            {(fundingSourceTypes ?? []).map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.fundingSourceTypeId && <p className="text-xs text-destructive">{errors.fundingSourceTypeId}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="code">Código *</Label>
        <Input
          id="code"
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          placeholder="Ej: PNUD-2025"
          className={errors.code ? "border-destructive" : ""}
          maxLength={50}
        />
        {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="name">Nombre *</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Nombre de la fuente de financiamiento"
          className={errors.name ? "border-destructive" : ""}
          maxLength={200}
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
          placeholder="Descripción de la fuente de financiamiento..."
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading || typesLoading}>
          {isLoading ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
