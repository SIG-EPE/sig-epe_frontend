"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
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
import { useUpdateDraftPlanningLineCost } from "@/hooks/use-budget";
import { ApiRequestError } from "@/lib/api-client";
import { buildDraftCost } from "@/lib/draft-cost";
import type { PlanningLine } from "@/types/budget";

interface Props {
  line: PlanningLine;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

export function DraftCostModal({ line, onClose, onSuccess }: Props) {
  const [price, setPrice] = useState(
    String(line.unit_price_decimal ?? line.unit_price ?? ""),
  );
  const [quantity, setQuantity] = useState(
    String(line.quantity_decimal ?? line.quantity ?? ""),
  );
  const [submitted, setSubmitted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { update, isLoading } = useUpdateDraftPlanningLineCost(line.id);
  const pending = useRef(false);
  const validation = buildDraftCost(price, quantity);

  async function save() {
    if (pending.current || isLoading) return;
    setSubmitted(true);
    if (!validation.request) return;
    setSaveError(null);
    pending.current = true;
    try {
      await update(validation.request);
      toast.success("Costo del borrador actualizado");
      await onSuccess();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 403)
        setSaveError(
          "No tienes permiso para editar esta línea. Los valores ingresados se conservaron.",
        );
      else if (error instanceof ApiRequestError && error.status === 400)
        setSaveError(
          "El servidor rechazó los valores. Revísalos antes de reintentar.",
        );
      else if (error instanceof ApiRequestError && error.status === 409)
        setSaveError(
          "La línea cambió de estado. Recarga el detalle antes de volver a editar.",
        );
      else setSaveError("No se pudo guardar el costo. Intenta de nuevo.");
    } finally {
      pending.current = false;
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isLoading && !pending.current) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar costo</DialogTitle>
          <DialogDescription>
            Cambia solo precio unitario y cantidad del borrador. La programación
            mensual puede necesitar ajustes antes de enviar la línea.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="draft-unit-price">Precio unitario (S/)</Label>
            <Input
              id="draft-unit-price"
              type="text"
              inputMode="decimal"
              value={price}
              disabled={isLoading}
              aria-invalid={submitted && !!validation.errors.unit_price}
              aria-describedby={
                submitted && validation.errors.unit_price
                  ? "draft-price-error"
                  : undefined
              }
              onChange={(event) => {
                setPrice(event.target.value);
                setSaveError(null);
              }}
            />
            {submitted && validation.errors.unit_price && (
              <p
                id="draft-price-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {validation.errors.unit_price}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="draft-quantity">Cantidad</Label>
            <Input
              id="draft-quantity"
              type="text"
              inputMode="decimal"
              value={quantity}
              disabled={isLoading}
              aria-invalid={submitted && !!validation.errors.quantity}
              aria-describedby={
                submitted && validation.errors.quantity
                  ? "draft-quantity-error"
                  : undefined
              }
              onChange={(event) => {
                setQuantity(event.target.value);
                setSaveError(null);
              }}
            />
            {submitted && validation.errors.quantity && (
              <p
                id="draft-quantity-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {validation.errors.quantity}
              </p>
            )}
          </div>
        </div>
        <p aria-live="polite">
          Total derivado (precio × cantidad):{" "}
          {validation.total === null
            ? "No calculable"
            : `S/ ${validation.total}`}
        </p>
        {submitted && validation.errors.total && (
          <p role="alert" className="text-sm text-destructive">
            {validation.errors.total}
          </p>
        )}
        {saveError && (
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isLoading}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={isLoading}
            onClick={() => void save()}
          >
            {isLoading ? "Guardando…" : "Guardar costo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
