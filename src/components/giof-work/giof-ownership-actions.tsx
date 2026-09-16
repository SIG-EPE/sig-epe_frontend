"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  useGiofAssignees,
  useGiofOwnershipCommands,
} from "@/hooks/use-giof-work";
import { ROLE_CODE } from "@/lib/constants";
import { isGiofWorkLifecycleEligible } from "@/lib/role-capabilities";
import {
  GIOF_WORK_ASSIGNMENT_STATE,
  GIOF_WORK_LEASE_STATE,
  GIOF_WORK_POOL,
  type GiofWorkAssignmentState,
  type GiofWorkMetadata,
} from "@/types/giof-work";

const OWNERSHIP_ACTION = {
  RELEASE: "release",
  TAKE: "take",
  FORCE: "force",
} as const;

type OwnershipAction = (typeof OWNERSHIP_ACTION)[keyof typeof OWNERSHIP_ACTION];

interface GiofOwnershipActionsProps {
  requestId: string;
  label: string;
  work: GiofWorkMetadata;
  roleCode?: string | null;
  currentUserId?: string | null;
  refetchPoolQueue: (options?: { force?: boolean }) => Promise<void>;
}

function getAssignmentState(
  work: GiofWorkMetadata,
  currentUserId?: string | null,
): GiofWorkAssignmentState | null {
  if (work.assignmentState) return work.assignmentState;
  if (work.assigneeId === null) return GIOF_WORK_ASSIGNMENT_STATE.UNASSIGNED;
  if (work.assigneeId && work.assigneeId === currentUserId)
    return GIOF_WORK_ASSIGNMENT_STATE.SELF;
  if (work.assigneeId) return GIOF_WORK_ASSIGNMENT_STATE.OTHER;
  return null;
}

function hasActiveForeignLease(
  work: GiofWorkMetadata,
  currentUserId?: string | null,
): boolean {
  if (work.leaseState === GIOF_WORK_LEASE_STATE.ACTIVE_OTHER) return true;
  return Boolean(
    work.lease?.ownerId &&
    work.lease.ownerId !== currentUserId &&
    work.lease.expiresAt &&
    new Date(work.lease.expiresAt).getTime() > Date.now(),
  );
}

function getCandidateName(candidate: {
  firstName: string;
  lastName: string;
}): string {
  return (
    `${candidate.firstName} ${candidate.lastName}`.trim() || "Usuario GIOF"
  );
}

export function GiofOwnershipActions({
  requestId,
  label,
  work,
  roleCode,
  currentUserId,
  refetchPoolQueue,
}: GiofOwnershipActionsProps) {
  const isManager = roleCode === ROLE_CODE.GIOF_MANAGER;
  const isGestor = roleCode === ROLE_CODE.GIOF_GESTOR;
  const isOperational = isManager || isGestor;
  const assignmentState = getAssignmentState(work, currentUserId);
  const activeForeignLease = hasActiveForeignLease(work, currentUserId);
  const parsedVersion = Number(work.assignmentVersion);
  const hasSafeVersion =
    Number.isSafeInteger(parsedVersion) && parsedVersion >= 0;
  const [action, setAction] = useState<OwnershipAction | null>(null);
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const commands = useGiofOwnershipCommands({
    pool: work.pool,
    refetchPoolQueue,
  });
  const assignees = useGiofAssignees({
    enabled: action === OWNERSHIP_ACTION.FORCE,
  });
  const candidates = assignees.data ?? [];
  const forceIsValid =
    targetId.length > 0 &&
    reason.trim().length >= 1 &&
    reason.trim().length <= 1000 &&
    (work.pool !== GIOF_WORK_POOL.PAYMENT || acknowledged);

  if (
    !isOperational ||
    !isGiofWorkLifecycleEligible(work) ||
    !assignmentState ||
    !hasSafeVersion
  )
    return null;

  function open(nextAction: OwnershipAction): void {
    setSuccessMessage(null);
    commands.clearError();
    setAction(nextAction);
  }

  function close(): void {
    if (commands.isSubmitting) return;
    resetDialog();
  }

  function resetDialog(): void {
    setAction(null);
    setTargetId("");
    setReason("");
    setAcknowledged(false);
    commands.clearError();
  }

  async function submit(): Promise<void> {
    if (!action || commands.isSubmitting) return;
    try {
      if (action === OWNERSHIP_ACTION.RELEASE) {
        await commands.release({
          requestId,
          pool: work.pool,
          expectedAssignmentVersion: parsedVersion,
        });
        setSuccessMessage("Trabajo liberado. Las colas fueron actualizadas.");
        toast.success("Trabajo liberado.");
      } else if (action === OWNERSHIP_ACTION.TAKE) {
        await commands.take({
          requestId,
          pool: work.pool,
          expectedVersion: parsedVersion,
        });
        setSuccessMessage(
          "Trabajo asignado a ti. Las colas fueron actualizadas.",
        );
        toast.success("Trabajo asignado a ti.");
      } else {
        if (!forceIsValid) return;
        await commands.forceReassign({
          requestId,
          pool: work.pool,
          expectedAssignmentVersion: parsedVersion,
          targetAssigneeId: targetId,
          reason: reason.trim(),
          confirmed: true,
          ...(work.pool === GIOF_WORK_POOL.PAYMENT
            ? { acknowledgePaymentInterruption: true as const }
            : {}),
        });
        setSuccessMessage("Trabajo reasignado. Las colas fueron actualizadas.");
        toast.success("Trabajo reasignado.");
      }
      resetDialog();
    } catch {
      // El hook conserva el error recuperable y el modal permanece abierto.
    }
  }

  const canTake =
    assignmentState !== GIOF_WORK_ASSIGNMENT_STATE.SELF && !activeForeignLease;
  const canForce =
    isManager && assignmentState !== GIOF_WORK_ASSIGNMENT_STATE.UNASSIGNED;

  return (
    <div
      className="flex flex-wrap justify-end gap-2"
      data-testid="giof-ownership-actions"
    >
      {assignmentState === GIOF_WORK_ASSIGNMENT_STATE.SELF && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => open(OWNERSHIP_ACTION.RELEASE)}
        >
          Liberar trabajo
        </Button>
      )}
      {canTake && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => open(OWNERSHIP_ACTION.TAKE)}
        >
          Tomar para mí
        </Button>
      )}
      {isGestor &&
        assignmentState !== GIOF_WORK_ASSIGNMENT_STATE.SELF &&
        activeForeignLease && (
          <Button type="button" size="sm" variant="outline" disabled>
            En proceso por otro gestor
          </Button>
        )}
      {canForce && (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => open(OWNERSHIP_ACTION.FORCE)}
        >
          Forzar reasignación
        </Button>
      )}
      {successMessage && (
        <span role="status" aria-live="polite" className="sr-only">
          {successMessage}
        </span>
      )}
      <Dialog
        open={action !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) close();
        }}
      >
        <DialogContent closeDisabled={commands.isSubmitting}>
          <DialogHeader>
            <DialogTitle>
              {action === OWNERSHIP_ACTION.RELEASE
                ? "Liberar trabajo"
                : action === OWNERSHIP_ACTION.TAKE
                  ? "Tomar para mí"
                  : "Forzar reasignación"}
            </DialogTitle>
            <DialogDescription>
              {action === OWNERSHIP_ACTION.RELEASE
                ? `Confirma que deseas dejar ${label} sin asignar.`
                : action === OWNERSHIP_ACTION.TAKE
                  ? `Confirma que deseas asignar ${label} a tu usuario.`
                  : `Selecciona el nuevo responsable de ${label} y registra el motivo.`}
            </DialogDescription>
          </DialogHeader>

          {action === OWNERSHIP_ACTION.FORCE && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor={`giof-force-target-${requestId}`}
                  className="text-sm font-medium"
                >
                  Responsable destino
                </label>
                <select
                  id={`giof-force-target-${requestId}`}
                  aria-label="Responsable destino"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={targetId}
                  disabled={commands.isSubmitting || assignees.isLoading}
                  onChange={(event) => setTargetId(event.target.value)}
                >
                  <option value="">Selecciona responsable</option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {getCandidateName(candidate)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor={`giof-force-reason-${requestId}`}
                  className="text-sm font-medium"
                >
                  Motivo
                </label>
                <Textarea
                  id={`giof-force-reason-${requestId}`}
                  aria-label="Motivo"
                  minLength={1}
                  maxLength={1000}
                  value={reason}
                  disabled={commands.isSubmitting}
                  onChange={(event) => setReason(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Entre 1 y 1000 caracteres.
                </p>
              </div>
              {work.pool === GIOF_WORK_POOL.PAYMENT && (
                <div className="space-y-2 rounded-md border border-destructive/40 p-3">
                  <p className="text-sm text-destructive">
                    Esta reasignación puede interrumpir el trabajo de pago en
                    curso. Verifica su estado antes de continuar.
                  </p>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={acknowledged}
                      disabled={commands.isSubmitting}
                      onChange={(event) =>
                        setAcknowledged(event.target.checked)
                      }
                    />
                    Confirmo la interrupción y la revisión posterior del pago.
                  </label>
                </div>
              )}
              {assignees.error && (
                <p role="alert" className="text-sm text-destructive">
                  No se pudo cargar el catálogo de responsables GIOF.
                </p>
              )}
            </div>
          )}

          {commands.error && (
            <p
              role="alert"
              aria-live="assertive"
              className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
            >
              {commands.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={commands.isSubmitting}
              onClick={close}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={
                commands.isSubmitting ||
                (action === OWNERSHIP_ACTION.FORCE && !forceIsValid)
              }
              onClick={() => void submit()}
            >
              {commands.isSubmitting
                ? "Procesando..."
                : action === OWNERSHIP_ACTION.RELEASE
                  ? "Confirmar liberación"
                  : action === OWNERSHIP_ACTION.TAKE
                    ? "Confirmar toma"
                    : "Confirmar reasignación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
