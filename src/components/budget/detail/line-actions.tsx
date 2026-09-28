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
  recoverFromPlanningLineStateConflict,
  useApprovePlanningLine,
  useSubmitPlanningLine,
} from "@/hooks/use-budget";
import type { PlanningLine } from "@/hooks/use-budget";
import { ROLE_CODE } from "@/lib/constants";

interface LineActionsProps {
  line: PlanningLine;
  roleCode?: string;
  onRefetch: () => void;
  onApproved: (line: PlanningLine) => void;
}

export function LineActions({ line, roleCode, onRefetch, onApproved }: LineActionsProps) {
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  const { submit, isLoading: isSubmitting } = useSubmitPlanningLine(line.id);
  const { approve, isLoading: isApproving } = useApprovePlanningLine(line.id);
  const canReviewLine = roleCode === ROLE_CODE.GIOF_MANAGER && line.status === "SUBMITTED";

  async function handleSubmit() {
    try {
      await submit();
      toast.success("Linea enviada");
      onRefetch();
    } catch (error) {
      const conflictMessage = recoverFromPlanningLineStateConflict(error);
      toast.error(conflictMessage ?? getSubmitPlanningLineErrorMessage(error) ?? "Error al enviar la linea");
      if (conflictMessage) onRefetch();
    }
  }

  async function handleApprove() {
    try {
      const approvedLine = await approve();
      onApproved(approvedLine);
      toast.success("Linea aprobada");
      setApproveConfirmOpen(false);
    } catch (error) {
      const conflictMessage = recoverFromPlanningLineStateConflict(error);
      toast.error(conflictMessage ?? getPlanningLineMutationErrorMessage(error) ?? "Error al aprobar la linea");
      setApproveConfirmOpen(false);
      if (conflictMessage) onRefetch();
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

        {/* Solo GIOF_MANAGER puede aprobar o rechazar líneas enviadas */}
        {canReviewLine && (
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
      {canReviewLine && <Dialog open={approveConfirmOpen} onOpenChange={setApproveConfirmOpen}>
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
      </Dialog>}

      {/* Modal de rechazo */}
      {canReviewLine && <RejectModal
        lineId={line.id}
        open={rejectModalOpen}
        onOpenChange={setRejectModalOpen}
        onSuccess={onRefetch}
      />}
    </>
  );
}
