"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { CatalogDeactivateModal } from "@/components/catalogs/shared/catalog-deactivate-modal";
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
import { Textarea } from "@/components/ui/textarea";
import {
  executePoaNodeAction,
  POA_NODE_ACTION,
  POA_NODE_LEVEL,
} from "@/hooks/use-poa-hierarchy";
import type { PoaHierarchyUiAction } from "./poa-hierarchy-tree";

const NodeFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(500, "Máximo 500 caracteres"),
  reason: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
});

interface PoaNodeDialogProps {
  action: PoaHierarchyUiAction | null;
  onClose: () => void;
  onSuccess: () => void;
}

const ACTION_TITLE = {
  create: "Crear nodo POA",
  rename: "Renombrar nodo POA",
  deactivate: "Desactivar nodo POA",
  reactivate: "Reactivar nodo POA",
  publish: "Publicar nodo POA",
  replacement: "Crear reemplazo canónico",
} as const;

function nodeLabel(action: PoaHierarchyUiAction): string {
  if (action.level === POA_NODE_LEVEL.RESOURCE) return "Descripción del recurso";
  if (action.level === POA_NODE_LEVEL.ACTION) return "Nombre de la acción";
  return "Nombre del componente";
}

export function PoaNodeDialog({ action, onClose, onSuccess }: PoaNodeDialogProps) {
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setName(action?.currentName ?? "");
    setReason("");
    setError(null);
  }, [action]);

  if (!action) return null;

  const run = async (payload: PoaHierarchyUiAction) => {
    setIsLoading(true);
    try {
      await executePoaNodeAction(payload);
      toast.success(
        payload.kind === POA_NODE_ACTION.CREATE
          ? "Nodo POA creado"
          : payload.kind === POA_NODE_ACTION.RENAME
            ? "Nodo POA renombrado"
            : "Jerarquía POA actualizada",
      );
      onSuccess();
      onClose();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "No se pudo actualizar la jerarquía POA");
    } finally {
      setIsLoading(false);
    }
  };

  if (action.kind === POA_NODE_ACTION.DEACTIVATE) {
    return (
      <CatalogDeactivateModal
        open
        entityName={action.currentName ?? "este nodo"}
        isLoading={isLoading}
        onClose={onClose}
        onConfirm={() => run(action)}
      />
    );
  }

  const isForm = action.kind === POA_NODE_ACTION.CREATE ||
    action.kind === POA_NODE_ACTION.RENAME ||
    action.kind === POA_NODE_ACTION.REPLACEMENT;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = NodeFormSchema.safeParse({ name, reason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los campos");
      return;
    }
    if (action.kind === POA_NODE_ACTION.REPLACEMENT && !parsed.data.reason) {
      setError("El motivo del reemplazo es requerido");
      return;
    }
    setError(null);
    await run({ ...action, name: parsed.data.name, reason: parsed.data.reason });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{ACTION_TITLE[action.kind]}</DialogTitle>
          <DialogDescription>
            {isForm
              ? "El código es generado exclusivamente por el backend y no puede editarse."
              : `Confirma la operación sobre ${action.currentName ?? "el nodo seleccionado"}.`}
          </DialogDescription>
        </DialogHeader>
        {isForm ? (
          <form className="space-y-4" onSubmit={submit}>
            {action.fullCode && (
              <div className="space-y-1">
                <Label htmlFor="poa-node-code">Código (solo lectura)</Label>
                <Input id="poa-node-code" value={action.fullCode} readOnly aria-readonly="true" />
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="poa-node-name">{nodeLabel(action)} *</Label>
              {action.level === POA_NODE_LEVEL.RESOURCE ? (
                <Textarea id="poa-node-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={500} rows={4} />
              ) : (
                <Input id="poa-node-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={500} />
              )}
            </div>
            {action.kind === POA_NODE_ACTION.REPLACEMENT && (
              <div className="space-y-1">
                <Label htmlFor="poa-node-reason">Motivo del reemplazo *</Label>
                <Textarea id="poa-node-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} />
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
              <Button type="submit" disabled={isLoading}>{isLoading ? "Guardando..." : "Guardar"}</Button>
            </DialogFooter>
          </form>
        ) : (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancelar</Button>
            <Button type="button" onClick={() => void run(action)} disabled={isLoading}>
              {isLoading ? "Procesando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
