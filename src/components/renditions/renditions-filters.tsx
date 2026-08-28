"use client";

import { useEffect, useState } from "react";

import { GiofWorkScopeFilter } from "@/components/giof-work/giof-work-controls";
import { QueueFilterChips } from "@/components/queue-filters/queue-filter-chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GIOF_HELP_CONTEXT } from "@/lib/giof-assignment-help";
import type { RenditionsQueueUrlFilters } from "@/lib/queue-filters/renditions";
import { RENDITION_DIRECTION_OPTIONS, RENDITION_SORT_OPTIONS, getRenditionStatusLabel } from "@/lib/requests";
import { REQUEST_RENDITION_SELECTOR_STATUSES } from "@/lib/request-status-vocabulary";
import { GIOF_WORK_SCOPE } from "@/types/giof-work";
import { RENDITION_DEADLINE_BUCKET } from "@/types/requests";

const ALL_VALUE = "ALL";

const DEADLINE_BUCKET_LABEL = {
  [RENDITION_DEADLINE_BUCKET.NONE]: "Sin fecha límite",
  [RENDITION_DEADLINE_BUCKET.DUE_TODAY]: "Vence hoy",
  [RENDITION_DEADLINE_BUCKET.DUE_SOON]: "Vence en 1 a 15 días",
  [RENDITION_DEADLINE_BUCKET.OVERDUE]: "Plazo vencido",
} as const;

interface RenditionsFiltersProps {
  filters: RenditionsQueueUrlFilters;
  isManager: boolean;
  isOperational: boolean;
  count: number;
  isLoading: boolean;
  isRefreshing: boolean;
  onChange: (patch: Partial<RenditionsQueueUrlFilters>) => void;
  onClear: () => void;
}

interface FilterChipDefinition {
  key: string;
  label: string;
  patch: Partial<RenditionsQueueUrlFilters>;
}

function getChips(filters: RenditionsQueueUrlFilters, isManager: boolean): FilterChipDefinition[] {
  const chips: FilterChipDefinition[] = [];
  if (isManager && filters.work_scope && filters.work_scope !== GIOF_WORK_SCOPE.ALL) {
    const label = filters.work_scope === GIOF_WORK_SCOPE.MINE
      ? "Trabajo: mi trabajo"
      : filters.work_scope === GIOF_WORK_SCOPE.UNASSIGNED
        ? "Trabajo: sin asignar"
        : "Trabajo: responsable seleccionado";
    chips.push({ key: "work", label, patch: { work_scope: undefined, assignee_id: undefined } });
  }
  if (filters.search) chips.push({ key: "search", label: `Búsqueda: ${filters.search}`, patch: { search: undefined } });
  if (filters.status) chips.push({ key: "status", label: `Estado: ${getRenditionStatusLabel(filters.status)}`, patch: { status: undefined } });
  if (filters.deadline_bucket) chips.push({ key: "deadline-bucket", label: `Plazo: ${DEADLINE_BUCKET_LABEL[filters.deadline_bucket]}`, patch: { deadline_bucket: undefined } });
  if (filters.deadline_from || filters.deadline_to) chips.push({ key: "deadline-range", label: `Fecha límite: ${filters.deadline_from ?? "inicio"} – ${filters.deadline_to ?? "hoy"}`, patch: { deadline_from: undefined, deadline_to: undefined } });
  const sort = RENDITION_SORT_OPTIONS.find((option) => option.value === filters.sort);
  if (sort && filters.sort !== "last_activity") chips.push({ key: "sort", label: `Orden: ${sort.label}`, patch: { sort: undefined } });
  if (filters.direction && filters.direction !== "desc") chips.push({ key: "direction", label: "Dirección: ascendente", patch: { direction: undefined } });
  return chips;
}

export function RenditionsFilters({ filters, isManager, isOperational, count, isLoading, isRefreshing, onChange, onClear }: RenditionsFiltersProps) {
  const [search, setSearch] = useState(filters.search ?? "");
  const [deadlineFrom, setDeadlineFrom] = useState(filters.deadline_from ?? "");
  const [deadlineTo, setDeadlineTo] = useState(filters.deadline_to ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSearch(filters.search ?? ""), [filters.search]);
  useEffect(() => {
    setDeadlineFrom(filters.deadline_from ?? "");
    setDeadlineTo(filters.deadline_to ?? "");
  }, [filters.deadline_from, filters.deadline_to]);

  function applyDeadlineRange(): void {
    if (deadlineFrom && deadlineTo && deadlineFrom > deadlineTo) {
      setError("La fecha límite desde no puede ser posterior a la fecha hasta.");
      return;
    }
    setError(null);
    onChange({ deadline_from: deadlineFrom || undefined, deadline_to: deadlineTo || undefined });
  }

  const chips = getChips(filters, isManager);
  const liveMessage = isLoading ? "Cargando rendiciones" : isRefreshing ? `Actualizando ${count} rendiciones` : `${count} resultados filtrados`;

  return (
    <section className="space-y-4 rounded-xl border bg-muted/20 p-4" aria-label="Filtros de la bandeja de rendiciones">
      {isOperational && <GiofWorkScopeFilter value={filters.work_scope ?? (isManager ? GIOF_WORK_SCOPE.ALL : GIOF_WORK_SCOPE.MINE)} assigneeId={filters.assignee_id} isManager={isManager} onChange={(work_scope, assignee_id) => onChange({ work_scope, assignee_id: work_scope === GIOF_WORK_SCOPE.ASSIGNEE ? assignee_id : undefined })} helpContext={GIOF_HELP_CONTEXT.REXAN} />}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem_15rem]">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); onChange({ search: search.trim() || undefined }); }}>
          <label className="sr-only" htmlFor="renditions-search">Buscar rendiciones</label>
          <Input id="renditions-search" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder="Código, concepto, solicitante o área" />
          <Button type="submit" variant="outline">Buscar</Button>
        </form>
        <div>
          <label className="sr-only" htmlFor="renditions-status-filter">Estado derivado de rendición</label>
          <Select value={filters.status ?? ALL_VALUE} onValueChange={(value) => onChange({ status: value === ALL_VALUE ? undefined : value as RenditionsQueueUrlFilters["status"] })}>
            <SelectTrigger id="renditions-status-filter" data-testid="renditions-status-filter"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Ver todo</SelectItem>
              {REQUEST_RENDITION_SELECTOR_STATUSES.map((value) => <SelectItem key={value} value={value}>{getRenditionStatusLabel(value)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <label className="space-y-1 text-sm"><span className="sr-only">Plazo de rendición</span><select className="h-9 w-full rounded-md border bg-background px-3" aria-label="Plazo de rendición" value={filters.deadline_bucket ?? ALL_VALUE} onChange={(event) => onChange({ deadline_bucket: event.target.value === ALL_VALUE ? undefined : event.target.value as RenditionsQueueUrlFilters["deadline_bucket"] })}><option value={ALL_VALUE}>Todos los plazos</option>{Object.entries(DEADLINE_BUCKET_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <details className="rounded-md border bg-background p-3">
        <summary className="cursor-pointer text-sm font-medium">Filtros avanzados</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm">Fecha límite desde<Input aria-label="Fecha límite desde" type="date" value={deadlineFrom} onChange={(event) => setDeadlineFrom(event.target.value)} /></label>
          <label className="space-y-1 text-sm">Fecha límite hasta<Input aria-label="Fecha límite hasta" type="date" value={deadlineTo} onChange={(event) => setDeadlineTo(event.target.value)} /></label>
          <label className="space-y-1 text-sm">Orden<select className="block h-9 w-full rounded-md border bg-background px-3" value={filters.sort} onChange={(event) => onChange({ sort: event.target.value as RenditionsQueueUrlFilters["sort"] })}>{RENDITION_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="space-y-1 text-sm">Dirección<select className="block h-9 w-full rounded-md border bg-background px-3" value={filters.direction} onChange={(event) => onChange({ direction: event.target.value as RenditionsQueueUrlFilters["direction"] })}>{RENDITION_DIRECTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
        <Button type="button" size="sm" className="mt-3" onClick={applyDeadlineRange}>Aplicar fechas</Button>
      </details>
      <QueueFilterChips chips={chips.map((chip) => ({ key: chip.key, label: chip.label, onRemove: () => onChange(chip.patch) }))} onClear={onClear} />
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">{liveMessage}</p>
    </section>
  );
}
