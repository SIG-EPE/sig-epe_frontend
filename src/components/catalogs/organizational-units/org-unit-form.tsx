"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useCreateOrganizationalUnit, useUpdateOrganizationalUnit } from "@/hooks/use-catalogs";
import type { OrganizationalUnit, CreateOrganizationalUnitDto, UpdateOrganizationalUnitDto } from "@/types/catalogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const OrgUnitSchema = z.object({
  code: z.string().max(20, "Máximo 20 caracteres").optional(),
  name: z.string().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  short_name: z.string().max(50, "Máximo 50 caracteres").optional(),
  responsibleName: z.string().max(200, "Máximo 200 caracteres").nullable().optional(),
  budgetCeiling: z.number().min(0, "El techo no puede ser negativo").nullable().optional(),
});

type OrgUnitFormData = z.infer<typeof OrgUnitSchema>;

interface OrgUnitFormProps {
  /** Si viene: modo edición */
  item?: OrganizationalUnit;
  /** Si viene: modo creación de sub-unidad (parentId queda fijo) */
  parentId?: string;
  parentName?: string;
  /** Techo disponible del padre = techo padre - suma de hijos existentes */
  availableCeiling?: number | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function OrgUnitForm({
  item,
  parentId,
  parentName,
  availableCeiling,
  onClose,
  onSuccess,
}: OrgUnitFormProps) {
  const isEdit = Boolean(item);
  const { create, isLoading: createLoading } = useCreateOrganizationalUnit();
  const { update, isLoading: updateLoading } = useUpdateOrganizationalUnit(item?.id ?? "");
  const isLoading = createLoading || updateLoading;

  const [form, setForm] = useState<OrgUnitFormData>({
    code: item?.code ?? "",
    name: item?.name ?? "",
    short_name: item?.short_name ?? "",
    responsibleName: item?.responsibleName ?? null,
    budgetCeiling: item?.budgetCeiling ?? null,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof OrgUnitFormData, string>>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = OrgUnitSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof OrgUnitFormData, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof OrgUnitFormData;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});

    try {
      /* El parentId viene de la prop cuando se crea una sub-unidad;
         en edición, se preserva el parentId que ya tenía la UO */
      const resolvedParentId = isEdit ? (item?.parentId ?? null) : (parentId ?? null);

      const dto = {
        code: parsed.data.code || undefined,
        name: parsed.data.name,
        short_name: parsed.data.short_name || undefined,
        parentId: resolvedParentId,
        responsibleName: parsed.data.responsibleName ?? null,
        budgetCeiling: parsed.data.budgetCeiling ?? null,
      };

      if (isEdit) {
        await update(dto as UpdateOrganizationalUnitDto);
        toast.success("Unidad orgánica actualizada exitosamente");
      } else {
        await create(dto as CreateOrganizationalUnitDto);
        toast.success("Unidad orgánica creada exitosamente");
      }

      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Indicador de sub-unidad (solo en creación con parentId) */}
      {!isEdit && parentName && (
        <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Sub-unidad de <span className="font-medium text-foreground">{parentName}</span>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="code">Código (opcional)</Label>
        <Input
          id="code"
          value={form.code ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          placeholder="Ej: GG"
          className={errors.code ? "border-destructive" : ""}
          maxLength={20}
        />
        {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="short_name">Sigla / Nombre corto (opcional)</Label>
        <Input
          id="short_name"
          value={form.short_name ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, short_name: e.target.value }))}
          placeholder="Ej: GIOF"
          maxLength={50}
        />
        {errors.short_name && <p className="text-xs text-destructive">{errors.short_name}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="name">Nombre completo *</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Nombre completo de la unidad orgánica"
          className={errors.name ? "border-destructive" : ""}
          maxLength={200}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1">
        <Label htmlFor="responsibleName">Responsable</Label>
        <Input
          id="responsibleName"
          value={form.responsibleName ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, responsibleName: e.target.value || null }))}
          placeholder="Nombre del responsable de la UO"
          maxLength={200}
        />
        {errors.responsibleName && (
          <p className="text-xs text-destructive">{errors.responsibleName}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="budgetCeiling">Techo Presupuestal (S/)</Label>
        <Input
          id="budgetCeiling"
          type="number"
          min={0}
          step="0.01"
          value={form.budgetCeiling ?? ""}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              budgetCeiling: e.target.value !== "" ? parseFloat(e.target.value) : null,
            }))
          }
          placeholder="Ej: 500000"
          className={errors.budgetCeiling ? "border-destructive" : ""}
        />
        {/* Muestra disponible del padre solo en creación de sub-unidad */}
        {!isEdit && availableCeiling != null && (
          <p className="text-xs text-muted-foreground">
            Disponible del padre: S/ {availableCeiling.toLocaleString("es-PE")}
          </p>
        )}
        {errors.budgetCeiling && (
          <p className="text-xs text-destructive">{errors.budgetCeiling}</p>
        )}
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
