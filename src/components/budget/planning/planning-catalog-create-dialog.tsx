"use client";

import { useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCatalogTerritories, useCreateBudgetProgram, useCreateOrganizationalUnit } from "@/hooks/use-catalogs";
import { ApiRequestError } from "@/lib/api-client";
import { isValidPoaPrefix } from "@/lib/poa-prefix";
import type { PlanningType } from "@/lib/planning-types";

const required = (label: string, max: number) => z.string().trim().min(1, `${label} es requerido`).max(max, `Máximo ${max} caracteres`);
const orgSchema = z.object({
  name: required("El nombre", 200),
  code: required("La sigla o código", 20).refine(isValidPoaPrefix, "Usa solo letras A-Z y números 0-9, sin espacios"),
});
const programSchema = z.object({
  code: required("El código", 20),
  name: required("El nombre", 255),
  territory_id: required("El territorio", 100),
});

interface Props {
  kind: "org" | "program";
  planningType: PlanningType;
  onClose: () => void;
  onCreated: (id: string, name: string, code: string) => Promise<void>;
}

export function PlanningCatalogCreateDialog({ kind, planningType, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [territoryId, setTerritoryId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdOnce, setCreatedOnce] = useState(false);
  const pending = useRef(false);
  const { create: createOrg } = useCreateOrganizationalUnit();
  const { create: createProgram } = useCreateBudgetProgram();
  const { data: territories, isLoading: territoriesLoading, error: territoriesError } = useCatalogTerritories();
  const title = kind === "org" ? "unidad orgánica" : "programa";
  const activeTerritories = territories?.filter((territory) => territory.is_active) ?? [];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (pending.current || createdOnce) return;
    const parsed = kind === "org"
      ? orgSchema.safeParse({ name, code: code.trim().toUpperCase() })
      : programSchema.safeParse({ name, code, territory_id: territoryId });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    if (kind === "program" && !activeTerritories.some((territory) => territory.id === territoryId)) {
      setErrors({ territory_id: "Selecciona un territorio activo" });
      return;
    }
    pending.current = true;
    setSaving(true);
    setErrors({});
    setServerError("");
    try {
      const created = kind === "org"
        ? await createOrg({ name: parsed.data.name, code: parsed.data.code })
        : await createProgram({ name: parsed.data.name, code: parsed.data.code, planningType, territory_id: territoryId });
      setCreatedOnce(true);
      // Un POST exitoso nunca se repite si falla la lectura posterior del catálogo.
      try {
        await onCreated(created.id, created.name, created.code ?? parsed.data.code);
      } catch {
        setServerError("Se creó el registro, pero no se pudo actualizar la lista. No vuelvas a crearlo; actualiza la página.");
        return;
      }
      onClose();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setServerError("Ya existe un registro con ese nombre o código. Busca el existente antes de agregarlo.");
      } else if (error instanceof ApiRequestError && error.status === 403) {
        setServerError("No tienes permiso para crear este catálogo. Contacta a un administrador.");
      } else {
        setServerError("No se pudo crear el registro. Revisa los datos o intenta de nuevo.");
      }
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Agregar {title}</DialogTitle></DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="catalog-create-name">Nombre *</Label>
            <Input id="catalog-create-name" value={name} maxLength={255} onChange={(event) => setName(event.target.value)} disabled={saving} />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="catalog-create-code">{kind === "org" ? "Sigla o código POA *" : "Código *"}</Label>
            <Input id="catalog-create-code" value={code} maxLength={20} onChange={(event) => setCode(event.target.value)} disabled={saving} />
            {errors.code && <p className="text-sm text-destructive">{errors.code}</p>}
          </div>
          {kind === "program" && (
            <div className="space-y-1">
              <p className="text-sm">Tipo: {planningType}</p>
              <Label htmlFor="catalog-create-territory">Territorio activo *</Label>
              <select id="catalog-create-territory" value={territoryId} onChange={(event) => setTerritoryId(event.target.value)} disabled={saving || territoriesLoading || Boolean(territoriesError)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Seleccionar territorio...</option>
                {activeTerritories.map((territory) => <option key={territory.id} value={territory.id}>{territory.name}</option>)}
              </select>
              {territoriesError && <p className="text-sm text-destructive">No se pudieron cargar los territorios activos.</p>}
              {errors.territory_id && <p className="text-sm text-destructive">{errors.territory_id}</p>}
            </div>
          )}
          {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || createdOnce || (kind === "program" && (territoriesLoading || Boolean(territoriesError)))}>{saving ? "Creando..." : `Crear ${title}`}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
