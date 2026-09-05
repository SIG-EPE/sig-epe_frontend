"use client";

import { useEffect, useState } from "react";

import { GiofWorkScopeFilter } from "@/components/giof-work/giof-work-controls";
import { QueueFilterChips } from "@/components/queue-filters/queue-filter-chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GIOF_HELP_CONTEXT } from "@/lib/giof-assignment-help";
import { formatDriveProjectionStatus, formatRexanActivationStatus } from "@/lib/integration-status-vocabulary";
import { isValidMoneyRange } from "@/lib/queue-filters/primitives";
import { PAYMENT_QUEUE_TAB, type PaymentQueueUrlFilters } from "@/lib/queue-filters/payment";
import { getPaymentRexanStatusLabel } from "@/lib/requests";
import { GIOF_WORK_SCOPE } from "@/types/giof-work";
import {
  DRIVE_PAYMENT_PROJECTION_STATUS,
  DRIVE_SOURCE_ACCOUNT,
  PAYMENT_COMPLETENESS,
  PAYMENT_QUEUE_SORT,
  PAYMENT_REXAN_STATUS,
  REQUEST_CURRENCY,
  type PaymentQueueSummary,
} from "@/types/requests";

const SOURCE_ACCOUNT_LABEL = {
  [DRIVE_SOURCE_ACCOUNT.BCP_PEN]: "BCP-SOLES",
  [DRIVE_SOURCE_ACCOUNT.BCP_USD]: "BCP-DOLARES",
  [DRIVE_SOURCE_ACCOUNT.BCP_ODF]: "BCP-ODF",
  [DRIVE_SOURCE_ACCOUNT.BBVA_PEN]: "BBVA-SOLES",
  [DRIVE_SOURCE_ACCOUNT.BBVA_USD]: "BBVA-DOLARES",
} as const;

const COMPLETENESS_LABEL = {
  [PAYMENT_COMPLETENESS.COMPLETE]: "Datos completos",
  [PAYMENT_COMPLETENESS.PROOF_MISSING]: "Falta constancia",
  [PAYMENT_COMPLETENESS.DETAILS_MISSING]: "Falta referencia",
  [PAYMENT_COMPLETENESS.SOURCE_MISSING]: "Falta cuenta de origen",
  [PAYMENT_COMPLETENESS.ANY_MISSING]: "Cualquier dato pendiente",
} as const;

const SORT_LABEL = {
  [PAYMENT_QUEUE_SORT.QUEUE_DATE_DESC]: "Más recientes primero",
  [PAYMENT_QUEUE_SORT.QUEUE_DATE_ASC]: "Más antiguas primero",
  [PAYMENT_QUEUE_SORT.PAYABLE_AMOUNT_ASC]: "Monto pagable: menor a mayor",
  [PAYMENT_QUEUE_SORT.PAYABLE_AMOUNT_DESC]: "Monto pagable: mayor a menor",
} as const;

interface PaymentQueueFiltersProps {
  filters: PaymentQueueUrlFilters;
  isManager: boolean;
  summary: PaymentQueueSummary | null;
  total: number;
  isLoading: boolean;
  isRefreshing: boolean;
  onChange: (patch: Partial<PaymentQueueUrlFilters>) => void;
  onClear: () => void;
}

interface FilterChipDefinition {
  key: string;
  label: string;
  patch: Partial<PaymentQueueUrlFilters>;
}

function getChips(filters: PaymentQueueUrlFilters, isManager: boolean): FilterChipDefinition[] {
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
  if (filters.approved_from || filters.approved_to) chips.push({ key: "approved", label: `Aprobación: ${filters.approved_from ?? "inicio"} – ${filters.approved_to ?? "hoy"}`, patch: { approved_from: undefined, approved_to: undefined } });
  if (filters.paid_from || filters.paid_to) chips.push({ key: "paid", label: `Pago: ${filters.paid_from ?? "inicio"} – ${filters.paid_to ?? "hoy"}`, patch: { paid_from: undefined, paid_to: undefined } });
  if (filters.source_account_key) chips.push({ key: "source", label: `Cuenta: ${SOURCE_ACCOUNT_LABEL[filters.source_account_key]}`, patch: { source_account_key: undefined } });
  if (filters.completeness && !(filters.tab === PAYMENT_QUEUE_TAB.PENDING_DATA && filters.completeness === PAYMENT_COMPLETENESS.ANY_MISSING)) chips.push({ key: "completeness", label: `Completitud: ${COMPLETENESS_LABEL[filters.completeness]}`, patch: { completeness: undefined } });
  if (filters.drive_status) chips.push({ key: "drive", label: formatDriveProjectionStatus(filters.drive_status), patch: { drive_status: undefined } });
  if (filters.rexan_status) chips.push({ key: "rexan", label: getPaymentRexanStatusLabel(filters.rexan_status, false), patch: { rexan_status: undefined } });
  if (filters.currency) {
    const range = [filters.amount_min, filters.amount_max].filter(Boolean).join(" – ");
    chips.push({ key: "amount", label: range ? `Monto pagable ${filters.currency}: ${range}` : `Moneda: ${filters.currency}`, patch: { currency: undefined, amount_min: undefined, amount_max: undefined } });
  }
  if (filters.sort && filters.sort !== PAYMENT_QUEUE_SORT.QUEUE_DATE_DESC) chips.push({ key: "sort", label: `Orden: ${SORT_LABEL[filters.sort]}`, patch: { sort: undefined } });
  return chips;
}

export function PaymentQueueFilters({ filters, isManager, summary, total, isLoading, isRefreshing, onChange, onClear }: PaymentQueueFiltersProps) {
  const [search, setSearch] = useState(filters.search ?? "");
  const [approvedFrom, setApprovedFrom] = useState(filters.approved_from ?? "");
  const [approvedTo, setApprovedTo] = useState(filters.approved_to ?? "");
  const [paidFrom, setPaidFrom] = useState(filters.paid_from ?? "");
  const [paidTo, setPaidTo] = useState(filters.paid_to ?? "");
  const [currency, setCurrency] = useState(filters.currency ?? "");
  const [amountMin, setAmountMin] = useState(filters.amount_min ?? "");
  const [amountMax, setAmountMax] = useState(filters.amount_max ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSearch(filters.search ?? ""), [filters.search]);
  useEffect(() => {
    setApprovedFrom(filters.approved_from ?? "");
    setApprovedTo(filters.approved_to ?? "");
    setPaidFrom(filters.paid_from ?? "");
    setPaidTo(filters.paid_to ?? "");
    setCurrency(filters.currency ?? "");
    setAmountMin(filters.amount_min ?? "");
    setAmountMax(filters.amount_max ?? "");
  }, [filters.approved_from, filters.approved_to, filters.paid_from, filters.paid_to, filters.currency, filters.amount_min, filters.amount_max]);

  function applyRanges(): void {
    if ((approvedFrom && approvedTo && approvedFrom > approvedTo)
      || (paidFrom && paidTo && paidFrom > paidTo)
      || !isValidMoneyRange(currency, amountMin, amountMax)) {
      setError("Revisa los rangos de fechas y el monto pagable. Los montos requieren moneda y dos decimales.");
      return;
    }
    setError(null);
    onChange({
      approved_from: approvedFrom || undefined,
      approved_to: approvedTo || undefined,
      paid_from: paidFrom || undefined,
      paid_to: paidTo || undefined,
      currency: currency ? currency as PaymentQueueUrlFilters["currency"] : undefined,
      amount_min: amountMin || undefined,
      amount_max: amountMax || undefined,
    });
  }

  const chips = getChips(filters, isManager);
  const count = summary?.count ?? total;
  const liveMessage = isLoading ? "Cargando pagos" : isRefreshing ? `Actualizando ${count} pagos` : `${count} resultados filtrados`;

  return (
    <section className="space-y-4 rounded-xl border bg-muted/20 p-4" aria-label="Filtros de la cola de pagos">
      {isManager && <GiofWorkScopeFilter value={filters.work_scope ?? GIOF_WORK_SCOPE.ALL} assigneeId={filters.assignee_id} isManager onChange={(work_scope, assignee_id) => onChange({ work_scope, assignee_id: work_scope === GIOF_WORK_SCOPE.ASSIGNEE ? assignee_id : undefined })} helpContext={GIOF_HELP_CONTEXT.PAYMENT} />}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem_15rem]">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); onChange({ search: search.trim() || undefined }); }}>
          <label className="sr-only" htmlFor="payment-queue-search">Buscar pagos</label>
          <Input id="payment-queue-search" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder="Código, concepto, beneficiario o referencia" />
          <Button type="submit" variant="outline">Buscar</Button>
        </form>
        <label className="space-y-1 text-sm"><span className="sr-only">Completitud del pago</span><select className="h-9 w-full rounded-md border bg-background px-3" aria-label="Completitud del pago" disabled={filters.tab === PAYMENT_QUEUE_TAB.PENDING_DATA} value={filters.tab === PAYMENT_QUEUE_TAB.PENDING_DATA ? PAYMENT_COMPLETENESS.ANY_MISSING : filters.completeness ?? "ALL"} onChange={(event) => onChange({ completeness: event.target.value === "ALL" ? undefined : event.target.value as PaymentQueueUrlFilters["completeness"] })}><option value="ALL">Toda completitud</option>{Object.entries(COMPLETENESS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span className="sr-only">Orden de pagos</span><select className="h-9 w-full rounded-md border bg-background px-3" aria-label="Orden de pagos" value={filters.sort ?? PAYMENT_QUEUE_SORT.QUEUE_DATE_DESC} onChange={(event) => onChange({ sort: event.target.value as PaymentQueueUrlFilters["sort"] })}>{Object.entries(SORT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <details className="rounded-md border bg-background p-3">
        <summary className="cursor-pointer text-sm font-medium">Filtros avanzados</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm">Aprobada desde<Input type="date" value={approvedFrom} onChange={(event) => setApprovedFrom(event.target.value)} /></label>
          <label className="space-y-1 text-sm">Aprobada hasta<Input type="date" value={approvedTo} onChange={(event) => setApprovedTo(event.target.value)} /></label>
          <label className="space-y-1 text-sm">Pagada desde<Input type="date" value={paidFrom} onChange={(event) => setPaidFrom(event.target.value)} /></label>
          <label className="space-y-1 text-sm">Pagada hasta<Input type="date" value={paidTo} onChange={(event) => setPaidTo(event.target.value)} /></label>
          <label className="space-y-1 text-sm">Cuenta de origen<select className="block h-9 w-full rounded-md border bg-background px-3" value={filters.source_account_key ?? "ALL"} onChange={(event) => onChange({ source_account_key: event.target.value === "ALL" ? undefined : event.target.value as PaymentQueueUrlFilters["source_account_key"] })}><option value="ALL">Todas las cuentas</option>{Object.entries(SOURCE_ACCOUNT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="space-y-1 text-sm">Estado Drive<select className="block h-9 w-full rounded-md border bg-background px-3" value={filters.drive_status ?? "ALL"} onChange={(event) => onChange({ drive_status: event.target.value === "ALL" ? undefined : event.target.value as PaymentQueueUrlFilters["drive_status"] })}><option value="ALL">Todos los estados Drive</option>{Object.values(DRIVE_PAYMENT_PROJECTION_STATUS).map((value) => <option key={value} value={value}>{formatDriveProjectionStatus(value)}</option>)}</select></label>
          <label className="space-y-1 text-sm">Estado REXAN<select className="block h-9 w-full rounded-md border bg-background px-3" value={filters.rexan_status ?? "ALL"} onChange={(event) => onChange({ rexan_status: event.target.value === "ALL" ? undefined : event.target.value as PaymentQueueUrlFilters["rexan_status"] })}><option value="ALL">Todos los estados REXAN</option>{Object.values(PAYMENT_REXAN_STATUS).map((value) => <option key={value} value={value}>{formatRexanActivationStatus(value)}</option>)}</select></label>
          <label className="space-y-1 text-sm">Moneda<select className="block h-9 w-full rounded-md border bg-background px-3" value={currency || "ALL"} onChange={(event) => setCurrency(event.target.value === "ALL" ? "" : event.target.value)}><option value="ALL">Todas las monedas</option>{Object.values(REQUEST_CURRENCY).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="space-y-1 text-sm">Monto pagable mínimo<Input inputMode="decimal" placeholder="0.00" value={amountMin} onChange={(event) => setAmountMin(event.target.value)} /></label>
          <label className="space-y-1 text-sm">Monto pagable máximo<Input inputMode="decimal" placeholder="0.00" value={amountMax} onChange={(event) => setAmountMax(event.target.value)} /></label>
        </div>
        {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
        <Button type="button" size="sm" className="mt-3" onClick={applyRanges}>Aplicar rangos</Button>
      </details>
      <QueueFilterChips chips={chips.map((chip) => ({ key: chip.key, label: chip.label, onRemove: () => onChange(chip.patch) }))} onClear={onClear} />
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">{liveMessage}</p>
    </section>
  );
}
