"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAddManualExecution } from "@/hooks/use-budget";

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
];

interface ManualExecutionModalProps {
  lineId: string;
  initialMonth?: number | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ManualExecutionModal({
  lineId,
  initialMonth,
  open,
  onClose,
  onSuccess,
}: ManualExecutionModalProps) {
  const [month, setMonth] = useState<number>(initialMonth ?? 1);
  const [amount, setAmount] = useState<string>("");
  const [concept, setConcept] = useState<string>("");
  const [executionDate, setExecutionDate] = useState<string>("");
  const [localError, setLocalError] = useState<string | null>(null);

  const { mutate, isLoading } = useAddManualExecution(lineId);

  function validate(): string | null {
    if (!month || month < 1 || month > 12) return "Seleccione un mes válido";
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 0.01) return "El monto debe ser mayor a S/ 0.01";
    if (!concept.trim()) return "El concepto es requerido";
    if (concept.trim().length > 500) return "El concepto no puede superar los 500 caracteres";
    if (!executionDate) return "La fecha de ejecución es requerida";
    return null;
  }

  async function handleSave() {
    const error = validate();
    if (error) {
      setLocalError(error);
      return;
    }
    setLocalError(null);

    await mutate(
      {
        month,
        amount: parseFloat(amount),
        concept: concept.trim(),
        execution_date: executionDate,
      },
      {
        onSuccess: () => {
          toast.success("Ejecución manual registrada");
          onSuccess();
        },
        onError: (e) => {
          toast.error(e.message ?? "Error al registrar ejecución");
        },
      },
    );
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setLocalError(null);
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar ejecución manual</DialogTitle>
          <DialogDescription>
            Complete los datos de la ejecución presupuestal manual.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Mes */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Mes</label>
            <Select
              value={String(month)}
              onValueChange={(val) => setMonth(Number(val))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccione el mes" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS_ES.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Monto */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Monto (S/)</label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              placeholder="0.00"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Concepto */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              Concepto <span className="text-muted-foreground font-normal">({concept.length}/500)</span>
            </label>
            <Textarea
              placeholder="Descripción del gasto ejecutado"
              value={concept}
              maxLength={500}
              rows={3}
              onChange={(e) => setConcept(e.target.value)}
            />
          </div>

          {/* Fecha de ejecución */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Fecha de ejecución</label>
            <input
              type="date"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
              value={executionDate}
              onChange={(e) => setExecutionDate(e.target.value)}
            />
          </div>

          {/* Error local */}
          {localError && (
            <p className="text-sm text-destructive">{localError}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
