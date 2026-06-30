"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  getPlanningLineMutationErrorMessage,
  useRejectPlanningLine,
} from "@/hooks/use-budget";

interface RejectModalProps {
  lineId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RejectModal({ lineId, open, onOpenChange, onSuccess }: RejectModalProps) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const { reject, isLoading } = useRejectPlanningLine(lineId);
  const router = useRouter();

  async function handleConfirm() {
    // Validacion Zod inline: min 10 caracteres
    if (reason.trim().length < 10) {
      setLocalError("El motivo debe tener al menos 10 caracteres");
      return;
    }

    try {
      await reject({ rejection_reason: reason.trim() });
      toast.success("Linea rechazada");
      setReason("");
      setLocalError(null);
      onOpenChange(false);
      onSuccess?.();
      router.refresh();
    } catch (error) {
      toast.error(getPlanningLineMutationErrorMessage(error) ?? "Error al rechazar la linea");
    }
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setReason("");
      setLocalError(null);
    }
    onOpenChange(newOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rechazar linea</DialogTitle>
          <DialogDescription>
            Indique el motivo del rechazo. Esta accion no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Textarea
            placeholder="Motivo del rechazo (minimo 10 caracteres)"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (localError) setLocalError(null);
            }}
            rows={4}
            aria-invalid={!!localError}
          />
          {localError && (
            <p className="text-sm text-destructive">{localError}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Rechazando..." : "Rechazar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
