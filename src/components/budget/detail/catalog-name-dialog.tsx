"use client";

import { useRef, useState, type FormEvent } from "react";
import { ApiRequestError, api } from "@/lib/api-client";
import { invalidateCatalogDomain } from "@/lib/query-tags";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CatalogNameTarget {
  level: string;
  label: string;
  path: string;
  id: string;
  name: string;
  maxLength: number | null;
}

interface Props {
  target: CatalogNameTarget;
  onClose: () => void;
  onRenamed: (name: string) => void | Promise<void>;
}

export function CatalogNameDialog({ target, onClose, onRenamed }: Props) {
  const [name, setName] = useState(target.name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const trimmed = name.trim();
    if (
      !trimmed ||
      (target.maxLength !== null && trimmed.length > target.maxLength) ||
      /[\u0000-\u001f\u007f]/.test(trimmed)
    ) {
      setError(
        target.maxLength === null
          ? "Ingresa un nombre válido."
          : `Ingresa un nombre válido de hasta ${target.maxLength} caracteres.`,
      );
      return;
    }
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`${target.path}/${target.id}`, { name: trimmed });
      invalidateCatalogDomain();
      await onRenamed(trimmed);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status === 400
          ? "El servidor rechazó el nombre. Revísalo y vuelve a intentar."
          : caught instanceof ApiRequestError && caught.status === 403
            ? "No tienes permiso para editar este catálogo."
            : caught instanceof ApiRequestError && caught.status === 409
              ? "El nombre ya está en uso o el catálogo cambió. Revisa el dato y vuelve a intentar."
              : "No se pudo guardar el nombre. Vuelve a intentar.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending.current) onClose();
      }}
    >
      <DialogContent closeDisabled={saving} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar nombre de {target.label}</DialogTitle>
          <DialogDescription>
            El nuevo nombre afecta a otras líneas que usan este catálogo. No
            guarda los cambios pendientes de la jerarquía ni del presupuesto.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="catalog-rename-name">
              Nuevo nombre de {target.label}
            </Label>
            <Input
              id="catalog-rename-name"
              data-autofocus
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              aria-invalid={!!error}
              aria-describedby={error ? "catalog-rename-error" : undefined}
            />
            {error && (
              <p id="catalog-rename-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar nombre"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
