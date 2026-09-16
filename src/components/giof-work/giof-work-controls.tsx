"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleHelp, History } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  bulkAssignGiofWork,
  fetchGiofHistory,
  getGiofConflictMessage,
  useGiofAssignees,
  useGiofClaimableWork,
  useGiofSelfClaim,
} from "@/hooks/use-giof-work";
import { ApiRequestError } from "@/lib/api-client";
import { ROLE_CODE, ROUTES } from "@/lib/constants";
import type { GiofHelpContext } from "@/lib/giof-assignment-help";
import { useAuthStore } from "@/stores/auth-store";
import {
  GIOF_CLAIMABLE_ASSIGNMENT_STATE,
  GIOF_WORK_POOL,
  GIOF_WORK_SCOPE,
  type GiofAssigneeCandidate,
  type GiofAssignmentBlocker,
  type GiofAssignmentHistoryItem,
  type GiofClaimableWorkItem,
  type GiofWorkMetadata,
  type GiofWorkPool,
  type GiofWorkScope,
} from "@/types/giof-work";
import { REQUEST_STATUS } from "@/types/requests";

export interface GiofSelectableWorkItem {
  requestId: string;
  label: string;
  work: GiofWorkMetadata;
}

interface GiofWorkScopeFilterProps {
  value: GiofWorkScope;
  assigneeId?: string;
  isManager: boolean;
  onChange: (scope: GiofWorkScope, assigneeId?: string) => void;
  helpContext: GiofHelpContext;
}

function getCandidateName(candidate: GiofAssigneeCandidate): string {
  return (
    `${candidate.firstName} ${candidate.lastName}`.trim() || "Usuario GIOF"
  );
}

function getHistoryUserName(
  item?: { first_name?: string | null; last_name?: string | null } | null,
): string {
  return `${item?.first_name ?? ""} ${item?.last_name ?? ""}`.trim() || "—";
}

const HISTORY_EVENT_LABELS: Readonly<Record<string, string>> = {
  AUTO_INITIAL: "Asignación inicial",
  MANUAL_ASSIGN: "Asignación manual",
  MANUAL_REASSIGN: "Reasignación manual",
};

const BLOCK_REASON_LABELS: Readonly<Record<string, string>> = {
  NOT_FOUND: "El trabajo ya no está disponible",
  INELIGIBLE_LIFECYCLE: "El estado actual no permite asignarlo",
  ASSIGNEE_MISMATCH: "El responsable cambió",
  VERSION_MISMATCH: "La asignación cambió desde que se seleccionó",
  ACTIVE_FOREIGN_LEASE: "Otra persona lo está usando",
};

export function getGiofAssignmentBlockerMessage(
  blocker: GiofAssignmentBlocker,
): string {
  const label = BLOCK_REASON_LABELS[blocker.reason] ?? "No se puede asignar";
  const status = blocker.currentStatus
    ? ` Estado: ${blocker.currentStatus}.`
    : "";
  const lease =
    blocker.reason === "ACTIVE_FOREIGN_LEASE" && blocker.leaseExpiresAt
      ? ` En uso hasta ${new Date(blocker.leaseExpiresAt).toLocaleString("es-PE")}.`
      : "";
  return `${label} (${blocker.reason}).${status}${lease}`;
}

function readBlockers(error: unknown): GiofAssignmentBlocker[] {
  if (!(error instanceof ApiRequestError)) return [];
  const body = error.body as unknown;
  if (typeof body !== "object" || body === null) return [];
  const message =
    "message" in body ? (body as { message?: unknown }).message : undefined;
  const source =
    typeof message === "object" && message !== null ? message : body;
  if (!("blocked_items" in source)) return [];
  const blockedItems = (source as { blocked_items?: unknown }).blocked_items;
  return Array.isArray(blockedItems)
    ? (blockedItems as GiofAssignmentBlocker[])
    : [];
}

export function GiofWorkScopeFilter({
  value,
  assigneeId,
  isManager,
  onChange,
  helpContext,
}: GiofWorkScopeFilterProps) {
  const assignees = useGiofAssignees({ enabled: isManager });
  const candidates = assignees.data ?? [];

  return (
    <div
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      aria-label="Filtro de asignación GIOF"
    >
      <Select
        value={value}
        onValueChange={(next) =>
          onChange(
            next as GiofWorkScope,
            next === GIOF_WORK_SCOPE.ASSIGNEE ? assigneeId : undefined,
          )
        }
      >
        <SelectTrigger className="sm:w-44" data-testid="giof-work-scope-filter">
          <SelectValue placeholder="Trabajo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={GIOF_WORK_SCOPE.MINE}>Mi trabajo</SelectItem>
          <SelectItem value={GIOF_WORK_SCOPE.ALL}>Todo</SelectItem>
          {isManager && (
            <SelectItem value={GIOF_WORK_SCOPE.UNASSIGNED}>
              Sin asignar
            </SelectItem>
          )}
          {isManager && (
            <SelectItem value={GIOF_WORK_SCOPE.ASSIGNEE}>
              Por responsable
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      {isManager && value === GIOF_WORK_SCOPE.ASSIGNEE && (
        <Select
          value={assigneeId}
          onValueChange={(next) => onChange(GIOF_WORK_SCOPE.ASSIGNEE, next)}
        >
          <SelectTrigger className="sm:w-56" data-testid="giof-assignee-filter">
            <SelectValue placeholder="Selecciona responsable" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {getCandidateName(candidate)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0 self-start sm:self-auto"
            >
              <Link
                href={`${ROUTES.HELP_GIOF_ASSIGNMENT}?context=${helpContext}#${helpContext}`}
                aria-label="Abrir ayuda sobre asignación GIOF"
                data-testid={`giof-assignment-help-${helpContext}`}
              >
                <CircleHelp aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ayuda sobre asignación GIOF</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

interface GiofWorkStatusProps {
  requestId: string;
  work?: GiofWorkMetadata;
  currentUserId?: string | null;
  isManager?: boolean;
}

export function GiofWorkStatus({
  requestId,
  work,
  currentUserId,
  isManager = false,
}: GiofWorkStatusProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<GiofAssignmentHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  if (!work) return null;

  const assigneeLabel =
    work.assigneeId === null
      ? "Sin asignar"
      : work.assigneeId === currentUserId
        ? "Asignada a ti"
        : work.assigneeName
          ? `Asignada a ${work.assigneeName}`
          : "Asignada a otra persona";
  const activeLease = Boolean(
    work.lease?.expiresAt && new Date(work.lease.expiresAt) > new Date(),
  );
  const pool = work.pool;

  async function openHistory(): Promise<void> {
    setHistoryOpen(true);
    setHistoryError(null);
    try {
      setHistory(await fetchGiofHistory(requestId, pool));
    } catch (error) {
      setHistoryError(getGiofConflictMessage(error));
    }
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      data-testid="giof-work-status"
    >
      <Badge
        variant={work.assigneeId ? "secondary" : "outline"}
        aria-label={`Asignación GIOF: ${assigneeLabel}`}
      >
        {assigneeLabel}
      </Badge>
      {activeLease && (
        <Badge variant="outline" aria-label="Asignación GIOF: En uso">
          En uso
        </Badge>
      )}
      {work.readOnly && (
        <Badge variant="outline" aria-label="Asignación GIOF: Solo lectura">
          Solo lectura
        </Badge>
      )}
      {isManager && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => void openHistory()}
          aria-label="Ver historial de asignación"
          data-testid="giof-history-button"
        >
          <History className="size-4" />
        </Button>
      )}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de asignación</DialogTitle>
            <DialogDescription>
              Eventos del pool {work.pool} para este trabajo.
            </DialogDescription>
          </DialogHeader>
          {historyError ? (
            <p className="text-sm text-destructive">{historyError}</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay cambios de asignación.
            </p>
          ) : (
            <ol className="space-y-3">
              {history.map((item) => (
                <li key={item.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">
                      {HISTORY_EVENT_LABELS[item.event_type] ??
                        "Cambio de asignación"}
                    </span>
                    <time>
                      {new Date(
                        item.occurred_at ?? item.created_at,
                      ).toLocaleString("es-PE")}
                    </time>
                  </div>
                  <p className="text-muted-foreground">
                    {getHistoryUserName(item.fromAssignee)} →{" "}
                    {getHistoryUserName(item.toAssignee)}
                  </p>
                  {item.note && <p className="mt-1">Nota: {item.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface GiofClaimableWorkPanelProps {
  pool: GiofWorkPool;
  pageSize?: number;
  refetchPoolQueue: (options?: { force?: boolean }) => Promise<void>;
}

function getClaimAssignmentLabel(item: GiofClaimableWorkItem): string {
  if (item.assignmentState === GIOF_CLAIMABLE_ASSIGNMENT_STATE.OWN)
    return "Ya está asignado a ti";
  if (item.assignmentState === GIOF_CLAIMABLE_ASSIGNMENT_STATE.UNASSIGNED)
    return "Sin asignar";
  return "Asignado a otra persona, sin lease activo";
}

function getClaimableStageLabel(item: GiofClaimableWorkItem): string {
  if (item.pool === GIOF_WORK_POOL.REQUEST) return "Revisión de solicitud";
  if (item.pool === GIOF_WORK_POOL.REXAN) return "Revisión de rendición REXAN";
  if (item.status === REQUEST_STATUS.PAID) {
    return "Seguimiento de pago pendiente: datos, constancia o activación REXAN";
  }
  return "Pago pendiente de transferencia";
}

export function GiofClaimableWorkPanel({
  pool,
  pageSize = 20,
  refetchPoolQueue,
}: GiofClaimableWorkPanelProps) {
  const roleCode = useAuthStore((state) => state.user?.role?.code);
  const isOperator =
    roleCode === ROLE_CODE.GIOF_GESTOR || roleCode === ROLE_CODE.GIOF_MANAGER;
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<GiofClaimableWorkItem | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const boundedPageSize = Math.min(50, Math.max(1, pageSize));
  const claimable = useGiofClaimableWork({
    pool,
    page,
    limit: boundedPageSize,
    enabled: isOperator,
  });
  const selfClaim = useGiofSelfClaim({
    pool,
    refetchClaimable: claimable.refetch,
    refetchPoolQueue,
  });
  const totalPages = Math.max(1, Math.ceil(claimable.total / claimable.limit));

  if (!isOperator) return null;

  async function confirmClaim(): Promise<void> {
    if (!selected || selfClaim.isSubmitting) return;
    setStatus(null);
    selfClaim.clearError();
    try {
      const result = await selfClaim.claim({
        requestId: selected.requestId,
        expectedVersion: Number(selected.assignmentVersion),
      });
      setStatus(
        result.changed
          ? "Trabajo asignado a ti. La cola fue actualizada."
          : "El trabajo ya estaba asignado a ti. La cola fue actualizada.",
      );
      setSelected(null);
    } catch {
      // El hook conserva el mensaje accionable para anunciarlo en el panel.
    }
  }

  return (
    <section
      className="space-y-3 rounded-md border p-4"
      aria-labelledby={`giof-claimable-${pool}`}
      data-testid={`giof-claimable-${pool}`}
    >
      <div>
        <h2 id={`giof-claimable-${pool}`} className="font-semibold">
          Trabajo disponible
        </h2>
        <p className="text-sm text-muted-foreground">
          Esta lista es referencial. La disponibilidad se valida nuevamente al
          confirmar.
        </p>
      </div>
      {claimable.isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Cargando trabajo disponible...
        </p>
      ) : claimable.error ? (
        <p role="alert" className="text-sm text-destructive">
          {getGiofConflictMessage(claimable.error)}
        </p>
      ) : claimable.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay trabajo disponible para tomar en esta etapa.
        </p>
      ) : (
        <ul className="space-y-2">
          {claimable.items.map((item) => {
            const label = item.requestCode ?? "Trabajo sin código";
            const isPending = selfClaim.pendingRequestId === item.requestId;
            return (
              <li
                key={item.requestId}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <p className="font-medium">{label}</p>
                  <p>{getClaimableStageLabel(item)}</p>
                  <p className="text-muted-foreground">
                    {getClaimAssignmentLabel(item)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={selfClaim.isSubmitting}
                  aria-label={`Tomar trabajo ${label}`}
                  onClick={() => {
                    setStatus(null);
                    selfClaim.clearError();
                    setSelected(item);
                  }}
                >
                  {isPending ? "Tomando..." : "Tomar trabajo"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {claimable.isRefreshing && (
        <p role="status" className="text-sm text-muted-foreground">
          Actualizando disponibilidad...
        </p>
      )}
      {status && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-emerald-700"
        >
          {status}
        </p>
      )}
      {selfClaim.error && (
        <p
          role="alert"
          aria-live="assertive"
          className="text-sm text-destructive"
        >
          {selfClaim.error.message}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Página {claimable.page} de {totalPages}. Total: {claimable.total}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              page <= 1 || claimable.isLoading || selfClaim.isSubmitting
            }
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Anterior
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              page >= totalPages ||
              claimable.isLoading ||
              selfClaim.isSubmitting
            }
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
          >
            Siguiente
          </Button>
        </div>
      </div>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open && !selfClaim.isSubmitting) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tomar trabajo</DialogTitle>
            <DialogDescription>
              Se actualizará la asignación a tu usuario. Después se refrescarán
              los datos; el lease de edición se adquiere por separado.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <p className="text-sm">
              {selected.requestCode ?? "Trabajo seleccionado"}:{" "}
              {getClaimAssignmentLabel(selected)}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={selfClaim.isSubmitting}
              onClick={() => setSelected(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={selfClaim.isSubmitting}
              onClick={() => void confirmClaim()}
            >
              {selfClaim.isSubmitting ? "Tomando..." : "Confirmar y tomar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

interface GiofBulkAssignmentBarProps {
  pool: GiofWorkPool;
  items: GiofSelectableWorkItem[];
  onClear: () => void;
  onSuccess: () => Promise<void> | void;
}

export function GiofBulkAssignmentBar({
  pool,
  items,
  onClear,
  onSuccess,
}: GiofBulkAssignmentBarProps) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [note, setNote] = useState("");
  const [blockers, setBlockers] = useState<GiofAssignmentBlocker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const assignees = useGiofAssignees({ enabled: open });
  const candidates = assignees.data ?? [];

  useEffect(() => {
    if (!open) return;
    setBlockers([]);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (open && assignees.error)
      setError(getGiofConflictMessage(assignees.error));
  }, [open, assignees.error]);

  if (items.length === 0) return null;

  async function submit(): Promise<void> {
    if (!targetId) {
      setError("Selecciona un responsable.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setBlockers([]);
    try {
      const result = await bulkAssignGiofWork({
        pool,
        items: items.map((item) => ({
          requestId: item.requestId,
          expectedAssigneeId: item.work.assigneeId,
          expectedVersion: Number(item.work.assignmentVersion),
        })),
        targetAssigneeId: targetId,
        note: note.trim() || undefined,
      });
      if (result.changed === 0 && result.unchanged > 0)
        toast.info(
          "Todos los trabajos ya estaban asignados al responsable seleccionado.",
        );
      else
        toast.success(
          `${result.changed} trabajo${result.changed === 1 ? "" : "s"} asignado${result.changed === 1 ? "" : "s"}.`,
        );
      setOpen(false);
      setTargetId("");
      setNote("");
      onClear();
      await onSuccess();
    } catch (reason) {
      setBlockers(readBlockers(reason));
      setError(getGiofConflictMessage(reason));
      if (reason instanceof ApiRequestError && reason.status === 409) {
        await Promise.resolve(onSuccess()).catch(() => undefined);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-md border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="giof-bulk-assignment-bar"
    >
      <p className="text-sm">
        {items.length} seleccionado{items.length === 1 ? "" : "s"} para
        asignación del mismo pool.
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onClear}>
          Limpiar
        </Button>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={items.length > 50}
        >
          Asignar / reasignar
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Asignar trabajo</DialogTitle>
            <DialogDescription>
              La operación es todo-o-nada para {items.length} elemento
              {items.length === 1 ? "" : "s"} del pool {pool}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="giof-assignment-target"
              >
                Responsable
              </label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger id="giof-assignment-target">
                  <SelectValue placeholder="Selecciona responsable" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {getCandidateName(candidate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="giof-assignment-note"
              >
                Nota opcional
              </label>
              <Textarea
                id="giof-assignment-note"
                value={note}
                maxLength={1000}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border p-2 text-sm">
              {items.map((item) => (
                <p key={item.requestId}>{item.label}</p>
              ))}
            </div>
            {error && (
              <p
                className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
                role="alert"
              >
                {error}
              </p>
            )}
            {blockers.length > 0 && (
              <div className="space-y-2" data-testid="giof-blocked-items">
                <p className="text-sm font-medium">Elementos bloqueados</p>
                {blockers.map((blocker, index) => (
                  <div
                    key={blocker.requestId}
                    className="rounded-md border p-2 text-sm"
                  >
                    <span className="font-medium">
                      {blocker.requestCode ??
                        items.find(
                          (item) => item.requestId === blocker.requestId,
                        )?.label ??
                        `Trabajo ${index + 1}`}
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {getGiofAssignmentBlockerMessage(blocker)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={isSubmitting || items.length < 1 || items.length > 50}
            >
              {isSubmitting ? "Asignando..." : "Confirmar asignación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
