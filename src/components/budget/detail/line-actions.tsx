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
import { RejectModal } from "@/components/budget/planning/reject-modal";
import {
  getPlanningLineMutationErrorMessage,
  getSubmitPlanningLineErrorMessage,
  useApprovePlanningLine,
  useSubmitPlanningLine,
} from "@/hooks/use-budget";
import type { PlanningLine } from "@/hooks/use-budget";

interface LineActionsProps {
  line: PlanningLine;
  isGiof: boolean;
  onRefetch: () => void;
}

export function LineActions({ line, isGiof, onRefetch }: LineActionsProps) {
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  const { submit, isLoading: isSubmitting } = useSubmitPlanningLine(line.id);
  const { approve, isLoading: isApproving } = useApprovePlanningLine(line.id);

  async function handleSubmit() {
    try {
      await submit();
      toast.success("Linea enviada");
      onRefetch();
    } catch (error) {
      toast.error(getSubmitPlanningLineErrorMessage(error) ?? "Error al enviar la linea");
    }
  }

  async function handleApprove() {
    try {
      await approve();
      toast.success("Linea aprobada");
      setApproveConfirmOpen(false);
      onRefetch();
    } catch (error) {
      toast.error(getPlanningLineMutationErrorMessage(error) ?? "Error al aprobar la linea");
      setApproveConfirmOpen(false);
    }
  }

  const isOwner = true; // TODO: compare with current user id

  return (
    <>
      <div className="flex gap-2">
        {/* DRAFT propio: boton Enviar */}
        {line.status === "DRAFT" && isOwner && (
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Enviar"}
          </Button>
        )}

        {/* SUBMITTED + GIOF: Aprobar y Rechazar */}
        {line.status === "SUBMITTED" && isGiof && (
          <>
            <Button
              variant="default"
              onClick={() => setApproveConfirmOpen(true)}
            >
              Aprobar
            </Button>
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setRejectModalOpen(true)}
            >
              Rechazar
            </Button>
          </>
        )}
      </div>

      {/* Confirmacion de aprobacion */}
      <Dialog open={approveConfirmOpen} onOpenChange={setApproveConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar aprobacion</DialogTitle>
            <DialogDescription>
              Esta accion aprobara la linea de planejamento. Continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApproveConfirmOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              onClick={handleApprove}
              disabled={isApproving}
            >
              {isApproving ? "Aprobando..." : "Aprobar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de rechazo */}
      <RejectModal
        lineId={line.id}
        open={rejectModalOpen}
        onOpenChange={setRejectModalOpen}
        onSuccess={onRefetch}
      />
    </>
  );
}
