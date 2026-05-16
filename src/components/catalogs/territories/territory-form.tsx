"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useCreateTerritory, useUpdateTerritory, useCatalogTerritories } from "@/hooks/use-catalogs";
import type { Territory, CreateTerritoryDto, UpdateTerritoryDto, TerritoryLevel } from "@/types/catalogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// -------------------------------------------------------
// Constantes y niveles
// -------------------------------------------------------

const LEVELS: TerritoryLevel[] = ["REGION", "PROVINCIA", "DISTRITO", "COMUNIDAD"];

const PARENT_LEVEL: Record<TerritoryLevel, TerritoryLevel | null> = {
  REGION: null,
  PROVINCIA: "REGION",
  DISTRITO: "PROVINCIA",
  COMUNIDAD: "DISTRITO",
};

// -------------------------------------------------------
// Zod schema
// -------------------------------------------------------

const TerritorySchema = z.object({
  code: z.string().min(1, "El código es requerido").max(20, "Máximo 20 caracteres"),
  name: z.string().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  level: z.enum(["REGION", "PROVINCIA", "DISTRITO", "COMUNIDAD"]),
  parent_id: z.string().optional(),
  ubigeo_code: z.string().max(6, "Máximo 6 caracteres").optional(),
});

type TerritoryFormData = z.infer<typeof TerritorySchema>;

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface TerritoryFormProps {
  item?: Territory;
  onClose: () => void;
  onSuccess: () => void;
}

// -------------------------------------------------------
// TerritoryForm component
// -------------------------------------------------------

export function TerritoryForm({ item, onClose, onSuccess }: TerritoryFormProps) {
  const isEdit = Boolean(item);
  const { create, isLoading: createLoading } = useCreateTerritory();
  const { update, isLoading: updateLoading } = useUpdateTerritory(item?.id ?? "");
  const isLoading = createLoading || updateLoading;

  const [form, setForm] = useState<TerritoryFormData>({
    code: item?.code ?? "",
    name: item?.name ?? "",
    level: item?.level ?? "REGION",
    parent_id: item?.parent_id ?? undefined,
    ubigeo_code: item?.ubigeo_code ?? "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof TerritoryFormData, string>>>({});

  // Cargar padres según nivel seleccionado
  const parentLevel = PARENT_LEVEL[form.level];
  const { data: parents, isLoading: parentsLoading } = useCatalogTerritories(
    parentLevel ?? undefined
  );

  const selectClass = (hasError?: boolean) =>
    `flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm${hasError ? " border-destructive" : ""}`;

  const handleLevelChange = (newLevel: TerritoryLevel) => {
    setForm((f) => ({ ...f, level: newLevel, parent_id: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = TerritorySchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof TerritoryFormData, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof TerritoryFormData;
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
        level: parsed.data.level,
        parent_id: parsed.data.parent_id || undefined,
        ubigeo_code: parsed.data.ubigeo_code || undefined,
      };

      if (isEdit) {
        await update(dto as UpdateTerritoryDto);
        toast.success("Territorio actualizado exitosamente");
      } else {
        await create(dto as CreateTerritoryDto);
        toast.success("Territorio creado exitosamente");
      }

      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Código */}
      <div className="space-y-1">
        <Label htmlFor="code">Código *</Label>
        <Input
          id="code"
          value={form.code}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          placeholder="Ej: 15"
          className={errors.code ? "border-destructive" : ""}
          maxLength={20}
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
          placeholder="Ej: Lima"
          className={errors.name ? "border-destructive" : ""}
          maxLength={200}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      {/* Nivel */}
      <div className="space-y-1">
        <Label htmlFor="level">Nivel *</Label>
        <select
          id="level"
          value={form.level}
          onChange={(e) => handleLevelChange(e.target.value as TerritoryLevel)}
          className={selectClass(Boolean(errors.level))}
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        {errors.level && <p className="text-xs text-destructive">{errors.level}</p>}
      </div>

      {/* Padre (condicional) */}
      {parentLevel && (
        <div className="space-y-1">
          <Label htmlFor="parent_id">{parentLevel} padre (opcional)</Label>
          <select
            id="parent_id"
            value={form.parent_id ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value || undefined }))}
            className={selectClass()}
            disabled={parentsLoading}
          >
            <option value="">Sin {parentLevel.toLowerCase()} padre</option>
            {parents?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Ubigeo */}
      <div className="space-y-1">
        <Label htmlFor="ubigeo_code">Código ubigeo (opcional)</Label>
        <Input
          id="ubigeo_code"
          value={form.ubigeo_code ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, ubigeo_code: e.target.value }))}
          placeholder="Ej: 150101"
          maxLength={6}
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
