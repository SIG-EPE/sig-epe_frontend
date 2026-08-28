"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleHelp, History } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { bulkAssignGiofWork, fetchGiofAssignees, fetchGiofHistory, getGiofConflictMessage } from "@/hooks/use-giof-work";
import { ApiRequestError } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import type { GiofHelpContext } from "@/lib/giof-assignment-help";
import { GIOF_WORK_SCOPE, type GiofAssigneeCandidate, type GiofAssignmentBlocker, type GiofAssignmentHistoryItem, type GiofWorkMetadata, type GiofWorkPool, type GiofWorkScope } from "@/types/giof-work";

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
  return `${candidate.firstName} ${candidate.lastName}`.trim() || "Usuario GIOF";
}

function getHistoryUserName(item?: { first_name?: string | null; last_name?: string | null } | null): string {
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

export function getGiofAssignmentBlockerMessage(blocker: GiofAssignmentBlocker): string {
  const label = BLOCK_REASON_LABELS[blocker.reason] ?? "No se puede asignar";
  const status = blocker.currentStatus ? ` Estado: ${blocker.currentStatus}.` : "";
  const lease = blocker.reason === "ACTIVE_FOREIGN_LEASE" && blocker.leaseExpiresAt
    ? ` En uso hasta ${new Date(blocker.leaseExpiresAt).toLocaleString("es-PE")}.`
    : "";
  return `${label} (${blocker.reason}).${status}${lease}`;
}

function readBlockers(error: unknown): GiofAssignmentBlocker[] {
  if (!(error instanceof ApiRequestError)) return [];
  const body = error.body as unknown;
  if (typeof body !== "object" || body === null) return [];
  const message = "message" in body ? (body as { message?: unknown }).message : undefined;
  const source = typeof message === "object" && message !== null ? message : body;
  if (!("blocked_items" in source)) return [];
  const blockedItems = (source as { blocked_items?: unknown }).blocked_items;
  return Array.isArray(blockedItems) ? blockedItems as GiofAssignmentBlocker[] : [];
}

export function GiofWorkScopeFilter({ value, assigneeId, isManager, onChange, helpContext }: GiofWorkScopeFilterProps) {
  const [candidates, setCandidates] = useState<GiofAssigneeCandidate[]>([]);

  useEffect(() => {
    if (!isManager) return;
    void fetchGiofAssignees().then(setCandidates).catch(() => setCandidates([]));
  }, [isManager]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center" aria-label="Filtro de asignación GIOF">
      <Select value={value} onValueChange={(next) => onChange(next as GiofWorkScope, next === GIOF_WORK_SCOPE.ASSIGNEE ? assigneeId : undefined)}>
        <SelectTrigger className="sm:w-44" data-testid="giof-work-scope-filter"><SelectValue placeholder="Trabajo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={GIOF_WORK_SCOPE.MINE}>Mi trabajo</SelectItem>
          <SelectItem value={GIOF_WORK_SCOPE.ALL}>Todo</SelectItem>
          {isManager && <SelectItem value={GIOF_WORK_SCOPE.UNASSIGNED}>Sin asignar</SelectItem>}
          {isManager && <SelectItem value={GIOF_WORK_SCOPE.ASSIGNEE}>Por responsable</SelectItem>}
        </SelectContent>
      </Select>
      {isManager && value === GIOF_WORK_SCOPE.ASSIGNEE && (
        <Select value={assigneeId} onValueChange={(next) => onChange(GIOF_WORK_SCOPE.ASSIGNEE, next)}>
          <SelectTrigger className="sm:w-56" data-testid="giof-assignee-filter"><SelectValue placeholder="Selecciona responsable" /></SelectTrigger>
          <SelectContent>{candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{getCandidateName(candidate)}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild type="button" variant="outline" size="icon" className="shrink-0 self-start sm:self-auto">
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

export function GiofWorkStatus({ requestId, work, currentUserId, isManager = false }: GiofWorkStatusProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<GiofAssignmentHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  if (!work) return null;

  const assigneeLabel = work.assigneeId === null
    ? "Sin asignar"
    : work.assigneeId === currentUserId
      ? "Asignada a ti"
      : work.assigneeName
        ? `Asignada a ${work.assigneeName}`
        : "Asignada a otra persona";
  const activeLease = Boolean(work.lease?.expiresAt && new Date(work.lease.expiresAt) > new Date());
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
    <div className="flex flex-wrap items-center gap-1" data-testid="giof-work-status">
      <Badge variant={work.assigneeId ? "secondary" : "outline"} aria-label={`Asignación GIOF: ${assigneeLabel}`}>{assigneeLabel}</Badge>
      {activeLease && <Badge variant="outline" aria-label="Asignación GIOF: En uso">En uso</Badge>}
      {work.readOnly && <Badge variant="outline" aria-label="Asignación GIOF: Solo lectura">Solo lectura</Badge>}
      {isManager && (
        <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => void openHistory()} aria-label="Ver historial de asignación" data-testid="giof-history-button">
          <History className="size-4" />
        </Button>
      )}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Historial de asignación</DialogTitle><DialogDescription>Eventos del pool {work.pool} para este trabajo.</DialogDescription></DialogHeader>
          {historyError ? <p className="text-sm text-destructive">{historyError}</p> : history.length === 0 ? <p className="text-sm text-muted-foreground">No hay cambios de asignación.</p> : (
            <ol className="space-y-3">
              {history.map((item) => (
                <li key={item.id} className="rounded-md border p-3 text-sm">
                   <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{HISTORY_EVENT_LABELS[item.event_type] ?? "Cambio de asignación"}</span><time>{new Date(item.occurred_at ?? item.created_at).toLocaleString("es-PE")}</time></div>
                  <p className="text-muted-foreground">{getHistoryUserName(item.fromAssignee)} → {getHistoryUserName(item.toAssignee)}</p>
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

interface GiofBulkAssignmentBarProps {
  pool: GiofWorkPool;
  items: GiofSelectableWorkItem[];
  onClear: () => void;
  onSuccess: () => Promise<void> | void;
}

export function GiofBulkAssignmentBar({ pool, items, onClear, onSuccess }: GiofBulkAssignmentBarProps) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [note, setNote] = useState("");
  const [candidates, setCandidates] = useState<GiofAssigneeCandidate[]>([]);
  const [blockers, setBlockers] = useState<GiofAssignmentBlocker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBlockers([]);
    setError(null);
    void fetchGiofAssignees().then(setCandidates).catch((reason: unknown) => setError(getGiofConflictMessage(reason)));
  }, [open]);

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
        items: items.map((item) => ({ requestId: item.requestId, expectedAssigneeId: item.work.assigneeId, expectedVersion: Number(item.work.assignmentVersion) })),
        targetAssigneeId: targetId,
        note: note.trim() || undefined,
      });
      if (result.changed === 0 && result.unchanged > 0) toast.info("Todos los trabajos ya estaban asignados al responsable seleccionado.");
      else toast.success(`${result.changed} trabajo${result.changed === 1 ? "" : "s"} asignado${result.changed === 1 ? "" : "s"}.`);
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
    <div className="mb-4 flex flex-col gap-3 rounded-md border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="giof-bulk-assignment-bar">
      <p className="text-sm">{items.length} seleccionado{items.length === 1 ? "" : "s"} para asignación del mismo pool.</p>
      <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClear}>Limpiar</Button><Button type="button" onClick={() => setOpen(true)} disabled={items.length > 50}>Asignar / reasignar</Button></div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Asignar trabajo</DialogTitle><DialogDescription>La operación es todo-o-nada para {items.length} elemento{items.length === 1 ? "" : "s"} del pool {pool}.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><label className="text-sm font-medium" htmlFor="giof-assignment-target">Responsable</label><Select value={targetId} onValueChange={setTargetId}><SelectTrigger id="giof-assignment-target"><SelectValue placeholder="Selecciona responsable" /></SelectTrigger><SelectContent>{candidates.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{getCandidateName(candidate)}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><label className="text-sm font-medium" htmlFor="giof-assignment-note">Nota opcional</label><Textarea id="giof-assignment-note" value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} /></div>
            <div className="max-h-40 overflow-y-auto rounded-md border p-2 text-sm">{items.map((item) => <p key={item.requestId}>{item.label}</p>)}</div>
            {error && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive" role="alert">{error}</p>}
            {blockers.length > 0 && <div className="space-y-2" data-testid="giof-blocked-items"><p className="text-sm font-medium">Elementos bloqueados</p>{blockers.map((blocker, index) => <div key={blocker.requestId} className="rounded-md border p-2 text-sm"><span className="font-medium">{blocker.requestCode ?? items.find((item) => item.requestId === blocker.requestId)?.label ?? `Trabajo ${index + 1}`}</span><span className="text-muted-foreground"> · {getGiofAssignmentBlockerMessage(blocker)}</span></div>)}</div>}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancelar</Button><Button type="button" onClick={() => void submit()} disabled={isSubmitting || items.length < 1 || items.length > 50}>{isSubmitting ? "Asignando..." : "Confirmar asignación"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
