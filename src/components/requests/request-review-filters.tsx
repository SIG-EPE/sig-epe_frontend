"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

import { GiofWorkScopeFilter } from "@/components/giof-work/giof-work-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrganizationalUnits } from "@/hooks/use-budget";
import { GIOF_HELP_CONTEXT } from "@/lib/giof-assignment-help";
import {
  REQUEST_REVIEW_SELECTOR_STATUSES,
  REQUEST_STATUS_SURFACE,
  formatRequestStatus,
} from "@/lib/request-status-vocabulary";
import { GIOF_WORK_SCOPE } from "@/types/giof-work";
import {
  REQUEST_CURRENCY,
  REQUEST_TYPE,
  type RequestReviewFilters as ReviewFilters,
  type RequestReviewSummary,
  type RequestStatus,
  type RequestType,
} from "@/types/requests";

const ALL_FILTER_VALUE = "ALL";
const MONEY_PATTERN = /^\d+\.\d{2}$/;

const REQUEST_TYPE_LABEL: Readonly<Record<RequestType, string>> = {
  [REQUEST_TYPE.ADVANCE]: "Anticipo",
  [REQUEST_TYPE.REIMBURSEMENT]: "Reembolso",
  [REQUEST_TYPE.SUPPLIER_PAYMENT]: "Pago a proveedor",
  [REQUEST_TYPE.ADVANCE_SETTLEMENT]: "Rendición",
};

const REQUEST_STATUS_OPTIONS = REQUEST_REVIEW_SELECTOR_STATUSES.map((value) => ({
  value,
  label: formatRequestStatus(value, { surface: REQUEST_STATUS_SURFACE.REVIEW }),
}));

function getReviewStatusLabel(status: RequestStatus): string {
  return formatRequestStatus(status, { surface: REQUEST_STATUS_SURFACE.REVIEW });
}

interface RequestReviewFiltersProps {
  filters: ReviewFilters;
  isManager: boolean;
  total: number;
  summary: RequestReviewSummary | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onChange: (patch: Partial<ReviewFilters>) => void;
  onClear: () => void;
}

interface ActiveFilterChip {
  key: string;
  label: string;
  patch: Partial<ReviewFilters>;
}

function isValidInterval(from: string, to: string): boolean {
  return (!from && !to) || (Boolean(from) && Boolean(to) && from < to);
}

function isValidAmountRange(currency: string, minimum: string, maximum: string): boolean {
  if (!minimum && !maximum) return true;
  if (!currency) return false;
  if ((minimum && !MONEY_PATTERN.test(minimum)) || (maximum && !MONEY_PATTERN.test(maximum))) return false;
  if (minimum && maximum) {
    return BigInt(minimum.replace(".", "")) <= BigInt(maximum.replace(".", ""));
  }
  return true;
}

function getActiveChips(filters: ReviewFilters, isManager: boolean): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (isManager && filters.work_scope && filters.work_scope !== GIOF_WORK_SCOPE.ALL) {
    const workScopeLabel = filters.work_scope === GIOF_WORK_SCOPE.UNASSIGNED
      ? "Trabajo: sin asignar"
      : filters.work_scope === GIOF_WORK_SCOPE.ASSIGNEE
        ? "Trabajo: responsable seleccionado"
        : "Trabajo: mi trabajo";
    chips.push({ key: "work-scope", label: workScopeLabel, patch: { work_scope: undefined, assignee_id: undefined } });
  }
  if (filters.search) chips.push({ key: "search", label: `Búsqueda: ${filters.search}`, patch: { search: undefined } });
  if (filters.request_type) chips.push({ key: "request-type", label: `Tipo: ${REQUEST_TYPE_LABEL[filters.request_type]}`, patch: { request_type: undefined } });
  if (filters.status) chips.push({ key: "status", label: `Estado: ${getReviewStatusLabel(filters.status)}`, patch: { status: undefined } });
  if (filters.submitted_from && filters.submitted_to) chips.push({ key: "submitted", label: `Enviada: ${filters.submitted_from} – ${filters.submitted_to}`, patch: { submitted_from: undefined, submitted_to: undefined } });
  if (filters.assigned_from && filters.assigned_to) chips.push({ key: "assigned", label: `Asignada: ${filters.assigned_from} – ${filters.assigned_to}`, patch: { assigned_from: undefined, assigned_to: undefined } });
  if (filters.currency) {
    const range = [filters.amount_min, filters.amount_max].filter(Boolean).join(" – ");
    chips.push({ key: "amount", label: range ? `Monto ${filters.currency}: ${range}` : `Moneda: ${filters.currency}`, patch: { currency: undefined, amount_min: undefined, amount_max: undefined } });
  }
  if (filters.org_unit_id) chips.push({ key: "org-unit", label: "Unidad organizacional seleccionada", patch: { org_unit_id: undefined } });
  return chips;
}

export function RequestReviewFilters({ filters, isManager, total, summary, isLoading, isRefreshing, onChange, onClear }: RequestReviewFiltersProps) {
  const [search, setSearch] = useState(filters.search ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(
    filters.submitted_from || filters.assigned_from || filters.currency || filters.org_unit_id,
  ));
  const [submittedFrom, setSubmittedFrom] = useState(filters.submitted_from ?? "");
  const [submittedTo, setSubmittedTo] = useState(filters.submitted_to ?? "");
  const [assignedFrom, setAssignedFrom] = useState(filters.assigned_from ?? "");
  const [assignedTo, setAssignedTo] = useState(filters.assigned_to ?? "");
  const [currency, setCurrency] = useState(filters.currency ?? "");
  const [amountMin, setAmountMin] = useState(filters.amount_min ?? "");
  const [amountMax, setAmountMax] = useState(filters.amount_max ?? "");
  const [orgUnitId, setOrgUnitId] = useState(filters.org_unit_id ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const firstAdvancedInputRef = useRef<HTMLInputElement>(null);
  const { data: orgUnits, isLoading: orgUnitsLoading, error: orgUnitsError } = useOrganizationalUnits();

  useEffect(() => {
    setSearch(filters.search ?? "");
  }, [filters.search]);

  useEffect(() => {
    setSubmittedFrom(filters.submitted_from ?? "");
    setSubmittedTo(filters.submitted_to ?? "");
    setAssignedFrom(filters.assigned_from ?? "");
    setAssignedTo(filters.assigned_to ?? "");
    setCurrency(filters.currency ?? "");
    setAmountMin(filters.amount_min ?? "");
    setAmountMax(filters.amount_max ?? "");
    setOrgUnitId(filters.org_unit_id ?? "");
    setAdvancedOpen(Boolean(
      filters.submitted_from || filters.assigned_from || filters.currency || filters.org_unit_id,
    ));
  }, [
    filters.submitted_from,
    filters.submitted_to,
    filters.assigned_from,
    filters.assigned_to,
    filters.currency,
    filters.amount_min,
    filters.amount_max,
    filters.org_unit_id,
  ]);

  function applyAdvancedFilters(): void {
    if (
      !isValidInterval(submittedFrom, submittedTo)
      || !isValidInterval(assignedFrom, assignedTo)
      || !isValidAmountRange(currency, amountMin, amountMax)
    ) {
      setValidationError("Revisa los intervalos y montos. Cada intervalo requiere un inicio anterior al fin y los montos requieren moneda y dos decimales.");
      firstAdvancedInputRef.current?.focus();
      return;
    }
    setValidationError(null);
    onChange({
      submitted_from: submittedFrom || undefined,
      submitted_to: submittedTo || undefined,
      assigned_from: assignedFrom || undefined,
      assigned_to: assignedTo || undefined,
      currency: currency ? currency as ReviewFilters["currency"] : undefined,
      amount_min: amountMin || undefined,
      amount_max: amountMax || undefined,
      org_unit_id: orgUnitId || undefined,
    });
  }

  const chips = getActiveChips(filters, isManager);
  const resultCount = summary?.count ?? total;
  const liveMessage = isLoading
    ? "Cargando solicitudes"
    : isRefreshing
      ? `Actualizando ${resultCount} solicitudes`
      : `${resultCount} ${resultCount === 1 ? "solicitud" : "solicitudes"}`;
  const currencySummary = summary
    ? Object.entries(summary.requested_amount_by_currency).filter((entry): entry is [string, string] => entry[1] !== undefined)
    : [];
  const statusSummary = summary
    ? Object.entries(summary.status_counts).filter((entry): entry is [RequestStatus, number] => entry[1] !== undefined)
    : [];

  return (
    <section className="space-y-4 rounded-xl border bg-muted/20 p-4" aria-label="Filtros de revisión de solicitudes">
      {isManager && (
        <GiofWorkScopeFilter
          value={filters.work_scope ?? GIOF_WORK_SCOPE.ALL}
          assigneeId={filters.assignee_id}
          isManager
          onChange={(workScope, assigneeId) => onChange({
            work_scope: workScope,
            assignee_id: workScope === GIOF_WORK_SCOPE.ASSIGNEE ? assigneeId : undefined,
          })}
          helpContext={GIOF_HELP_CONTEXT.REQUEST}
        />
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_14rem_14rem]">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); onChange({ search: search.trim() || undefined }); }}>
          <div className="relative min-w-0 flex-1">
            <label className="sr-only" htmlFor="request-review-search">Buscar solicitudes</label>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="request-review-search" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder="Código, concepto, beneficiario o línea POA" className="pl-9" />
          </div>
          <Button type="submit" variant="outline">Buscar</Button>
        </form>
        <div>
          <label className="sr-only" htmlFor="request-review-type">Tipo de solicitud</label>
          <Select value={filters.request_type ?? ALL_FILTER_VALUE} onValueChange={(value) => onChange({ request_type: value === ALL_FILTER_VALUE ? undefined : value as RequestType })}>
            <SelectTrigger id="request-review-type"><SelectValue placeholder="Tipo de solicitud" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>Todos los tipos</SelectItem>
              {Object.entries(REQUEST_TYPE_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="sr-only" htmlFor="request-review-status">Estado de solicitud</label>
          <Select value={filters.status ?? ALL_FILTER_VALUE} onValueChange={(value) => onChange({ status: value === ALL_FILTER_VALUE ? undefined : value as RequestStatus })}>
            <SelectTrigger id="request-review-status">
              <SelectValue placeholder="Estado de solicitud">
                {filters.status ? getReviewStatusLabel(filters.status) : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>Todos los estados</SelectItem>
              {REQUEST_STATUS_OPTIONS.map(({ value, label }) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button type="button" variant="outline" size="sm" aria-expanded={advancedOpen} aria-controls="request-review-advanced" onClick={() => setAdvancedOpen((current) => !current)}>
        <ChevronDown aria-hidden="true" className="size-4" />
        Filtros avanzados
      </Button>

      {advancedOpen && (
        <div id="request-review-advanced" className="space-y-4 border-t pt-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1"><label className="text-sm font-medium" htmlFor="review-submitted-from">Enviada desde</label><Input ref={firstAdvancedInputRef} id="review-submitted-from" type="datetime-local" value={submittedFrom} onChange={(event) => setSubmittedFrom(event.target.value)} aria-invalid={validationError ? true : undefined} /></div>
            <div className="space-y-1"><label className="text-sm font-medium" htmlFor="review-submitted-to">Enviada hasta</label><Input id="review-submitted-to" type="datetime-local" value={submittedTo} onChange={(event) => setSubmittedTo(event.target.value)} /></div>
            <div className="space-y-1"><label className="text-sm font-medium" htmlFor="review-assigned-from">Asignada desde</label><Input id="review-assigned-from" type="datetime-local" value={assignedFrom} onChange={(event) => setAssignedFrom(event.target.value)} /></div>
            <div className="space-y-1"><label className="text-sm font-medium" htmlFor="review-assigned-to">Asignada hasta</label><Input id="review-assigned-to" type="datetime-local" value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="review-currency">Moneda solicitada</label>
              <Select value={currency || ALL_FILTER_VALUE} onValueChange={(value) => setCurrency(value === ALL_FILTER_VALUE ? "" : value)}><SelectTrigger id="review-currency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL_FILTER_VALUE}>Sin filtro</SelectItem><SelectItem value={REQUEST_CURRENCY.PEN}>PEN</SelectItem><SelectItem value={REQUEST_CURRENCY.USD}>USD</SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1"><label className="text-sm font-medium" htmlFor="review-amount-min">Monto mínimo solicitado</label><Input id="review-amount-min" inputMode="decimal" value={amountMin} onChange={(event) => setAmountMin(event.target.value)} placeholder="0.00" /></div>
            <div className="space-y-1"><label className="text-sm font-medium" htmlFor="review-amount-max">Monto máximo solicitado</label><Input id="review-amount-max" inputMode="decimal" value={amountMax} onChange={(event) => setAmountMax(event.target.value)} placeholder="0.00" /></div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="review-org-unit">Unidad organizacional</label>
              <Select value={orgUnitId || ALL_FILTER_VALUE} onValueChange={(value) => setOrgUnitId(value === ALL_FILTER_VALUE ? "" : value)} disabled={orgUnitsLoading || Boolean(orgUnitsError)}><SelectTrigger id="review-org-unit"><SelectValue placeholder={orgUnitsLoading ? "Cargando unidades" : "Todas las unidades"} /></SelectTrigger><SelectContent><SelectItem value={ALL_FILTER_VALUE}>Todas las unidades</SelectItem>{(orgUnits ?? []).filter((unit) => unit.is_active).map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.code ? `${unit.code} · ` : ""}{unit.name}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          {orgUnitsError && <p className="text-sm text-destructive">No se pudieron cargar las unidades autorizadas.</p>}
          {validationError && <p className="text-sm text-destructive" role="alert">{validationError}</p>}
          <Button type="button" size="sm" onClick={applyAdvancedFilters}>Aplicar filtros avanzados</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {chip.label}
            <button type="button" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Quitar filtro ${chip.label}`} onClick={() => onChange(chip.patch)}><X aria-hidden="true" className="size-3" /></button>
          </span>
        ))}
        {chips.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={onClear} aria-label="Limpiar todos los filtros">Limpiar todos</Button>}
      </div>

      <p className="text-sm text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">
        {liveMessage}{summary ? " en la lista y el resumen" : ""}.
      </p>
      {summary && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Resumen de resultados filtrados">
          {currencySummary.map(([currencyCode, amount]) => <span key={currencyCode}>{currencyCode} {amount}</span>)}
          {statusSummary.map(([requestStatus, count]) => <span key={requestStatus}>{getReviewStatusLabel(requestStatus)}: {count}</span>)}
        </div>
      )}
    </section>
  );
}
