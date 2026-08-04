"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useExpensesByConceptDetailsReport, useExpensesByConceptReport, useExpensesByRequestTypeReport, useRequestsByStatusReport } from "@/hooks/use-reports";
import { usePlanningLines } from "@/hooks/use-budget";
import { useCatalogBudgetCategories, useCatalogBudgetPrograms, useCatalogFundingSources, useCatalogOrganizationalUnits, useCatalogTerritories } from "@/hooks/use-catalogs";
import { cn } from "@/lib/utils";
import {
  MONTH_OPTIONS,
  REPORT_DATE_FIELD_OPTIONS,
  REPORT_DIRECTION_OPTIONS,
  REPORT_SECTION,
  REPORT_SORT_OPTIONS,
  REQUEST_STATUS_REPORT_OPTIONS,
  REQUEST_TYPE_REPORT_OPTIONS,
  downloadReport,
  formatReportCurrency,
  formatReportPercent,
  getReportApiErrorMessage,
  getReportDateLabel,
  getRequestStatusReportLabel,
  getRequestTypeReportLabel,
  saveDownloadedReport,
  type ReportSection,
} from "@/lib/reports";
import { REPORT_DATE_FIELD, REPORT_SORT_DIRECTION, REPORT_SORT_FIELD, type ConceptDetailsFilters, type ReportFilters } from "@/types/reports";
import { REQUEST_CURRENCY, type RequestCurrency, type RequestStatus, type RequestType } from "@/types/requests";
import { useAuthStore } from "@/stores/auth-store";
import { getCatalogOptionLabel, getOrgUnitFilterLabel } from "@/lib/ui-labels";
import { TERRITORY_AGGREGATE_OPTIONS } from "@/lib/poa-territory-selection";

const SELECT_ALL = "ALL";
const DEFAULT_DETAILS_LIMIT = 50;
const QUICK_FILTER_DEBOUNCE_MS = 350;

const REPORT_TABS = [
  {
    value: REPORT_SECTION.REQUESTS_BY_STATUS,
    title: "Solicitudes por estado",
    description: "Distribución por avance del proceso y montos solicitados.",
  },
  {
    value: REPORT_SECTION.EXPENSES_BY_REQUEST_TYPE,
    title: "Gastos por tipo de solicitud",
    description: "Ejecución pagada agrupada por tipo de solicitud.",
  },
  {
    value: REPORT_SECTION.EXPENSES_BY_CONCEPT,
    title: "Gastos por concepto / detalle",
    description: "Resumen por concepto y detalle paginado de comprobantes y ejecuciones.",
  },
] as const;

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

interface ReportsFilterFormState {
  dateFrom: string;
  dateTo: string;
  dateField: string;
  fiscalYear: string;
  month: string;
  requestType: string;
  status: string;
  orgUnitId: string;
  planningLineId: string;
  categoryId: string;
  programId: string;
  territoryId: string;
  fundingSourceId: string;
  currency: string;
  search: string;
  conceptSearch: string;
  provider: string;
  minAmount: string;
  maxAmount: string;
  detailsLimit: number;
  detailsSort: typeof REPORT_SORT_FIELD[keyof typeof REPORT_SORT_FIELD];
  detailsDirection: typeof REPORT_SORT_DIRECTION[keyof typeof REPORT_SORT_DIRECTION];
}

function createDefaultFilterFormState(): ReportsFilterFormState {
  return {
    dateFrom: "",
    dateTo: "",
    dateField: SELECT_ALL,
    fiscalYear: "",
    month: SELECT_ALL,
    requestType: SELECT_ALL,
    status: SELECT_ALL,
    orgUnitId: SELECT_ALL,
    planningLineId: SELECT_ALL,
    categoryId: SELECT_ALL,
    programId: SELECT_ALL,
    territoryId: SELECT_ALL,
    fundingSourceId: SELECT_ALL,
    currency: SELECT_ALL,
    search: "",
    conceptSearch: "",
    provider: "",
    minAmount: "",
    maxAmount: "",
    detailsLimit: DEFAULT_DETAILS_LIMIT,
    detailsSort: REPORT_SORT_FIELD.EXPENSE_DATE,
    detailsDirection: REPORT_SORT_DIRECTION.DESC,
  };
}

function areFilterFormsEqual(left: ReportsFilterFormState, right: ReportsFilterFormState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toReportFilters(form: ReportsFilterFormState, activeReport: ReportSection): ReportFilters {
  return {
    date_from: optionalText(form.dateFrom),
    date_to: optionalText(form.dateTo),
    date_field: form.dateField === SELECT_ALL ? undefined : form.dateField as typeof REPORT_DATE_FIELD[keyof typeof REPORT_DATE_FIELD],
    fiscal_year: optionalNumber(form.fiscalYear),
    month: form.month === SELECT_ALL ? undefined : Number(form.month),
    request_type: form.requestType === SELECT_ALL ? undefined : form.requestType as RequestType,
    status: form.status === SELECT_ALL ? undefined : form.status as RequestStatus,
    org_unit_id: form.orgUnitId === SELECT_ALL ? undefined : form.orgUnitId,
    budget_planning_line_id: form.planningLineId === SELECT_ALL ? undefined : form.planningLineId,
    budget_category_id: form.categoryId === SELECT_ALL ? undefined : form.categoryId,
    program_id: form.programId === SELECT_ALL ? undefined : form.programId,
    territory_id: form.territoryId === SELECT_ALL ? undefined : form.territoryId,
    funding_source_id: form.fundingSourceId === SELECT_ALL ? undefined : form.fundingSourceId,
    currency: form.currency === SELECT_ALL ? undefined : form.currency as RequestCurrency,
    search: optionalText(form.search),
    provider: activeReport === REPORT_SECTION.EXPENSES_BY_CONCEPT ? optionalText(form.provider) : undefined,
    concept_search: activeReport === REPORT_SECTION.EXPENSES_BY_CONCEPT ? optionalText(form.conceptSearch) : undefined,
    min_amount: activeReport === REPORT_SECTION.EXPENSES_BY_CONCEPT ? optionalNumber(form.minAmount) : undefined,
    max_amount: activeReport === REPORT_SECTION.EXPENSES_BY_CONCEPT ? optionalNumber(form.maxAmount) : undefined,
  };
}

function updateFilterField<K extends keyof ReportsFilterFormState>(field: K, value: ReportsFilterFormState[K]) {
  return (current: ReportsFilterFormState): ReportsFilterFormState => ({ ...current, [field]: value });
}

function catalogLabel(item: { code?: string | null; name: string; short_name?: string | null }) {
  return getCatalogOptionLabel(item, { includeCode: true });
}

function ReportSkeleton() {
  return (
    <div className="space-y-3" data-testid="reports-loading-state">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-3/4" />
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="space-y-3 rounded-md border border-destructive/40 p-4" data-testid="reports-error-state">
      <p className="text-sm text-destructive">{getReportApiErrorMessage(error)}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>Reintentar</Button>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

function ParticipationCell({ value }: { value: number }) {
  const clampedValue = Math.max(0, Math.min(value, 100));
  const visualWidth = clampedValue > 0 ? Math.max(clampedValue, 4) : 0;

  return (
    <div className="ml-auto grid w-44 grid-cols-[6rem_3.5rem] items-center gap-3" data-testid="participation-cell">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full rounded-full bg-primary"
          data-testid="participation-bar"
          style={{ width: `${visualWidth}%` }}
        />
      </div>
      <span className="text-right font-medium tabular-nums" data-testid="participation-label">
        {formatReportPercent(value)}
      </span>
    </div>
  );
}

function TotalsSummary({ totals }: { totals: Array<{ currency: string; amount: number; count?: number }> }) {
  if (totals.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {totals.map((total) => (
        <Card key={total.currency}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Total {total.currency}</CardTitle>
            <CardDescription>{total.count !== undefined ? `${total.count} registro(s)` : "Monto acumulado"}</CardDescription>
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatReportCurrency(total.amount, total.currency)}</p></CardContent>
        </Card>
      ))}
    </div>
  );
}

function RequestsByStatusSection({ filters, enabled }: { filters: ReportFilters; enabled: boolean }) {
  const report = useRequestsByStatusReport(filters, { enabled });
  if (!enabled) return null;
  if (report.isLoading) return <ReportSkeleton />;
  if (report.error) return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  const data = report.data;
  if (!data || data.groups.length === 0) return <EmptyState>No se encontraron solicitudes para los filtros seleccionados.</EmptyState>;

  return (
    <div className="space-y-4">
      {report.isRefreshing && <p className="text-xs text-muted-foreground">Actualizando información...</p>}
      <TotalsSummary totals={data.totals.by_currency} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Estado</TableHead>
            <TableHead>Moneda</TableHead>
            <TableHead className="text-right">Solicitudes</TableHead>
            <TableHead className="text-right">Monto solicitado</TableHead>
            <TableHead className="w-44 text-right">Participación</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.groups.map((row) => (
            <TableRow key={`${row.status}-${row.currency}`}>
              <TableCell>{getRequestStatusReportLabel(row.status)}</TableCell>
              <TableCell>{row.currency}</TableCell>
              <TableCell className="text-right">{row.request_count}</TableCell>
              <TableCell className="text-right">{formatReportCurrency(row.requested_amount, row.currency)}</TableCell>
              <TableCell className="w-44 text-right"><ParticipationCell value={row.request_percentage} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ExpensesByRequestTypeSection({ filters, enabled }: { filters: ReportFilters; enabled: boolean }) {
  const report = useExpensesByRequestTypeReport(filters, { enabled });
  if (!enabled) return null;
  if (report.isLoading) return <ReportSkeleton />;
  if (report.error) return <ErrorState error={report.error} onRetry={() => void report.refetch()} />;
  const data = report.data;
  if (!data || data.groups.length === 0) return <EmptyState>No se encontraron gastos pagados para los filtros seleccionados.</EmptyState>;

  return (
    <div className="space-y-4">
      {report.isRefreshing && <p className="text-xs text-muted-foreground">Actualizando información...</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Solicitudes</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data.totals.request_count}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Pagos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data.totals.payment_count}</p></CardContent></Card>
      </div>
      <TotalsSummary totals={data.totals.by_currency} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo de solicitud</TableHead>
            <TableHead>Moneda</TableHead>
            <TableHead className="text-right">Solicitudes</TableHead>
            <TableHead className="text-right">Pagos</TableHead>
            <TableHead className="text-right">Monto ejecutado</TableHead>
            <TableHead className="w-44 text-right">Participación</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.groups.map((row) => (
            <TableRow key={`${row.request_type}-${row.currency}`}>
              <TableCell>{getRequestTypeReportLabel(row.request_type)}</TableCell>
              <TableCell>{row.currency}</TableCell>
              <TableCell className="text-right">{row.request_count}</TableCell>
              <TableCell className="text-right">{row.payment_count}</TableCell>
              <TableCell className="text-right">{formatReportCurrency(row.executed_amount, row.currency)}</TableCell>
              <TableCell className="w-44 text-right"><ParticipationCell value={row.amount_percentage} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ExpensesByConceptSection({ filters, detailsFilters, enabled, onPageChange }: { filters: ReportFilters; detailsFilters: ConceptDetailsFilters; enabled: boolean; onPageChange: (page: number) => void }) {
  const summary = useExpensesByConceptReport(filters, { enabled });
  const details = useExpensesByConceptDetailsReport(detailsFilters, { enabled });
  if (!enabled) return null;
  if (summary.isLoading || details.isLoading) return <ReportSkeleton />;
  if (summary.error) return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  if (details.error) return <ErrorState error={details.error} onRetry={() => void details.refetch()} />;

  return (
    <div className="space-y-6">
      {(summary.isRefreshing || details.isRefreshing) && <p className="text-xs text-muted-foreground">Actualizando información...</p>}
      {summary.data && summary.data.groups.length > 0 ? (
        <>
          <TotalsSummary totals={summary.data.totals.by_currency} />
          <Table>
            <TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead>Moneda</TableHead><TableHead className="text-right">Registros</TableHead><TableHead className="text-right">Solicitudes</TableHead><TableHead className="text-right">Monto</TableHead><TableHead className="w-44 text-right">Participación</TableHead></TableRow></TableHeader>
            <TableBody>
              {summary.data.groups.map((row) => (
                <TableRow key={`${row.concept}-${row.currency}`}>
                  <TableCell className="font-medium">{row.concept}</TableCell>
                  <TableCell>{row.currency}</TableCell>
                  <TableCell className="text-right">{row.row_count}</TableCell>
                  <TableCell className="text-right">{row.request_count}</TableCell>
                  <TableCell className="text-right">{formatReportCurrency(row.amount, row.currency)}</TableCell>
                  <TableCell className="w-44 text-right"><ParticipationCell value={row.amount_percentage} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : <EmptyState>No se encontraron conceptos para los filtros seleccionados.</EmptyState>}

      <div className="space-y-3">
        <div>
          <h3 className="font-semibold">Detalle de gastos</h3>
          <p className="text-sm text-muted-foreground">Página {details.data?.pagination.page ?? detailsFilters.page ?? 1} de {details.data?.pagination.total_pages ?? 1}. Total: {details.data?.pagination.total ?? 0}</p>
        </div>
        {details.data && details.data.rows.length > 0 ? (
          <Table>
            <TableHeader><TableRow><TableHead>Solicitud</TableHead><TableHead>Tipo</TableHead><TableHead>Concepto</TableHead><TableHead>Proveedor</TableHead><TableHead>Región</TableHead><TableHead>Provincia</TableHead><TableHead>Distrito</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader>
            <TableBody>
              {details.data.rows.map((row, index) => (
                <TableRow key={`${row.request_id}-${row.concept}-${index}`}>
                  <TableCell>{row.request_code ?? "Sin código"}</TableCell>
                  <TableCell>{getRequestTypeReportLabel(row.request_type)}</TableCell>
                  <TableCell><div className="max-w-72"><p className="font-medium">{row.concept}</p><p className="truncate text-xs text-muted-foreground">{row.detail}</p></div></TableCell>
                  <TableCell>{row.provider ?? "—"}</TableCell>
                  <TableCell>{row.territory_region ?? "—"}</TableCell>
                  <TableCell>{row.territory_province ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{row.territory_district ?? "—"}</span>
                      {row.territory_chain_mismatch && <Badge variant="outline">Desajuste aprobado</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{getReportDateLabel(row.expense_date ?? row.paid_at)}</TableCell>
                  <TableCell className="text-right">{formatReportCurrency(row.amount, row.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : <EmptyState>No hay detalle para mostrar.</EmptyState>}
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Se muestran {details.data?.pagination.limit ?? detailsFilters.limit} registros por página.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={(details.data?.pagination.page ?? 1) <= 1} onClick={() => onPageChange(Math.max(1, (details.data?.pagination.page ?? 1) - 1))}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={!details.data?.pagination.has_next} onClick={() => onPageChange((details.data?.pagination.page ?? 1) + 1)}>Siguiente</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AdvancedFiltersPanelProps {
  activeReport: ReportSection;
  draftFilters: ReportsFilterFormState;
  hasPendingChanges: boolean;
  onDraftChange: <K extends keyof ReportsFilterFormState>(field: K, value: ReportsFilterFormState[K]) => void;
  onApply: () => void;
}

function AdvancedFiltersPanel(props: AdvancedFiltersPanelProps) {
  const orgUnits = useCatalogOrganizationalUnits();
  const categories = useCatalogBudgetCategories();
  const programs = useCatalogBudgetPrograms();
  const territories = useCatalogTerritories();
  const fundingSources = useCatalogFundingSources();
  const planningLines = usePlanningLines({ status: "APPROVED", page: 1 });

  return (
    <div className="rounded-lg border bg-muted/20 p-4" data-testid="advanced-filters-panel">
      <div className="mb-4 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Edita los filtros avanzados sin recargar el reporte. Presiona aplicar cuando termines.</p>
        <Button type="button" onClick={props.onApply} disabled={!props.hasPendingChanges} data-testid="apply-advanced-filters">
          Aplicar filtros
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2"><Label>Fecha a evaluar</Label><Select value={props.draftFilters.dateField} onValueChange={(value) => props.onDraftChange("dateField", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={SELECT_ALL}>Predeterminada por reporte</SelectItem>{REPORT_DATE_FIELD_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="fiscal-year">Año fiscal</Label><Input id="fiscal-year" inputMode="numeric" value={props.draftFilters.fiscalYear} onChange={(event) => props.onDraftChange("fiscalYear", event.target.value)} placeholder="Ej. 2026" /></div>
        <div className="space-y-2"><Label>Mes</Label><Select value={props.draftFilters.month} onValueChange={(value) => props.onDraftChange("month", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={SELECT_ALL}>Todos</SelectItem>{MONTH_OPTIONS.map((option) => <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Tipo de solicitud</Label><Select value={props.draftFilters.requestType} onValueChange={(value) => props.onDraftChange("requestType", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={SELECT_ALL}>Todos</SelectItem>{REQUEST_TYPE_REPORT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Estado</Label><Select value={props.draftFilters.status} onValueChange={(value) => props.onDraftChange("status", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={SELECT_ALL}>Todos</SelectItem>{REQUEST_STATUS_REPORT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Moneda</Label><Select value={props.draftFilters.currency} onValueChange={(value) => props.onDraftChange("currency", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={SELECT_ALL}>Todas</SelectItem><SelectItem value={REQUEST_CURRENCY.PEN}>Soles</SelectItem><SelectItem value={REQUEST_CURRENCY.USD}>Dólares</SelectItem></SelectContent></Select></div>
        <div className="space-y-2"><Label>Unidad organizacional</Label><Select value={props.draftFilters.orgUnitId} onValueChange={(value) => props.onDraftChange("orgUnitId", value)}><SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger><SelectContent><SelectItem value={SELECT_ALL}>Todas</SelectItem>{(orgUnits.data ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{getOrgUnitFilterLabel(item)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Línea POA</Label><Select value={props.draftFilters.planningLineId} onValueChange={(value) => props.onDraftChange("planningLineId", value)}><SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger><SelectContent><SelectItem value={SELECT_ALL}>Todas</SelectItem>{planningLines.lines.map((line) => <SelectItem key={line.id} value={line.id}>{line.line_code ?? line.resource_description}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Categoría</Label><Select value={props.draftFilters.categoryId} onValueChange={(value) => props.onDraftChange("categoryId", value)}><SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger><SelectContent><SelectItem value={SELECT_ALL}>Todas</SelectItem>{(categories.data ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Programa</Label><Select value={props.draftFilters.programId} onValueChange={(value) => props.onDraftChange("programId", value)}><SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent><SelectItem value={SELECT_ALL}>Todos</SelectItem>{(programs.data ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{catalogLabel(item)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Territorio o alcance agregado</Label><Select value={props.draftFilters.territoryId} onValueChange={(value) => props.onDraftChange("territoryId", value)}><SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger><SelectContent><SelectItem value={SELECT_ALL}>Todos</SelectItem>{Object.values(TERRITORY_AGGREGATE_OPTIONS).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}{(territories.data ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{catalogLabel(item)}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Fuente de financiamiento</Label><Select value={props.draftFilters.fundingSourceId} onValueChange={(value) => props.onDraftChange("fundingSourceId", value)}><SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger><SelectContent><SelectItem value={SELECT_ALL}>Todas</SelectItem>{(fundingSources.data ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{catalogLabel(item)}</SelectItem>)}</SelectContent></Select></div>
        {props.activeReport === REPORT_SECTION.EXPENSES_BY_CONCEPT && (
          <>
            <div className="space-y-2"><Label htmlFor="concept-search">Concepto</Label><Input id="concept-search" value={props.draftFilters.conceptSearch} onChange={(event) => props.onDraftChange("conceptSearch", event.target.value)} placeholder="Ej. pasajes" /></div>
            <div className="space-y-2"><Label htmlFor="provider-search">Proveedor</Label><Input id="provider-search" value={props.draftFilters.provider} onChange={(event) => props.onDraftChange("provider", event.target.value)} placeholder="Nombre o RUC" /></div>
            <div className="space-y-2"><Label htmlFor="min-amount">Monto mínimo</Label><Input id="min-amount" inputMode="decimal" value={props.draftFilters.minAmount} onChange={(event) => props.onDraftChange("minAmount", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="max-amount">Monto máximo</Label><Input id="max-amount" inputMode="decimal" value={props.draftFilters.maxAmount} onChange={(event) => props.onDraftChange("maxAmount", event.target.value)} /></div>
            <div className="space-y-2"><Label>Ordenar detalle por</Label><Select value={props.draftFilters.detailsSort} onValueChange={(value) => props.onDraftChange("detailsSort", value as typeof REPORT_SORT_FIELD[keyof typeof REPORT_SORT_FIELD])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{REPORT_SORT_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Dirección</Label><Select value={props.draftFilters.detailsDirection} onValueChange={(value) => props.onDraftChange("detailsDirection", value as typeof REPORT_SORT_DIRECTION[keyof typeof REPORT_SORT_DIRECTION])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{REPORT_DIRECTION_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Registros por página</Label><Select value={String(props.draftFilters.detailsLimit)} onValueChange={(value) => props.onDraftChange("detailsLimit", Number(value))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="25">25</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem><SelectItem value="200">200</SelectItem></SelectContent></Select></div>
          </>
        )}
      </div>
    </div>
  );
}

export function ReportsPageView() {
  const [activeReport, setActiveReport] = useState<ReportSection>(REPORT_SECTION.REQUESTS_BY_STATUS);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ReportsFilterFormState>(() => createDefaultFilterFormState());
  const [appliedFilters, setAppliedFilters] = useState<ReportsFilterFormState>(() => createDefaultFilterFormState());
  const [detailsPage, setDetailsPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const authIsLoading = useAuthStore((store) => store.isLoading);
  const accessToken = useAuthStore((store) => store.accessToken);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setAppliedFilters((current) => ({
        ...current,
        dateFrom: draftFilters.dateFrom,
        dateTo: draftFilters.dateTo,
        search: draftFilters.search,
      }));
      setDetailsPage(1);
    }, QUICK_FILTER_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [draftFilters.dateFrom, draftFilters.dateTo, draftFilters.search]);

  useEffect(() => setDetailsPage(1), [activeReport]);

  const filters = toReportFilters(appliedFilters, activeReport);
  const detailsFilters: ConceptDetailsFilters = { ...filters, page: detailsPage, limit: appliedFilters.detailsLimit, sort: appliedFilters.detailsSort, direction: appliedFilters.detailsDirection };
  const activeTab = REPORT_TABS.find((tab) => tab.value === activeReport) ?? REPORT_TABS[0];
  const hasPendingAdvancedFilters = !areFilterFormsEqual(draftFilters, appliedFilters);

  function changeDraftFilter<K extends keyof ReportsFilterFormState>(field: K, value: ReportsFilterFormState[K]) {
    setDraftFilters(updateFilterField(field, value));
  }

  function applyDraftFilters() {
    setAppliedFilters(draftFilters);
    setDetailsPage(1);
  }

  function clearAppliedFilter<K extends keyof ReportsFilterFormState>(field: K, value: ReportsFilterFormState[K]) {
    setDraftFilters(updateFilterField(field, value));
    setAppliedFilters(updateFilterField(field, value));
    setDetailsPage(1);
  }

  const activeFilterChips = [
    optionalText(appliedFilters.search) ? { key: "search", label: `Búsqueda: ${appliedFilters.search}`, clear: () => clearAppliedFilter("search", "") } : null,
    optionalText(appliedFilters.dateFrom) ? { key: "date-from", label: `Desde: ${getReportDateLabel(appliedFilters.dateFrom)}`, clear: () => clearAppliedFilter("dateFrom", "") } : null,
    optionalText(appliedFilters.dateTo) ? { key: "date-to", label: `Hasta: ${getReportDateLabel(appliedFilters.dateTo)}`, clear: () => clearAppliedFilter("dateTo", "") } : null,
    appliedFilters.dateField !== SELECT_ALL ? { key: "date-field", label: `Fecha: ${REPORT_DATE_FIELD_OPTIONS.find((option) => option.value === appliedFilters.dateField)?.label ?? appliedFilters.dateField}`, clear: () => clearAppliedFilter("dateField", SELECT_ALL) } : null,
    optionalText(appliedFilters.fiscalYear) ? { key: "fiscal-year", label: `Año fiscal: ${appliedFilters.fiscalYear}`, clear: () => clearAppliedFilter("fiscalYear", "") } : null,
    appliedFilters.month !== SELECT_ALL ? { key: "month", label: `Mes: ${MONTH_OPTIONS.find((option) => String(option.value) === appliedFilters.month)?.label ?? appliedFilters.month}`, clear: () => clearAppliedFilter("month", SELECT_ALL) } : null,
    appliedFilters.requestType !== SELECT_ALL ? { key: "request-type", label: `Tipo: ${REQUEST_TYPE_REPORT_OPTIONS.find((option) => option.value === appliedFilters.requestType)?.label ?? appliedFilters.requestType}`, clear: () => clearAppliedFilter("requestType", SELECT_ALL) } : null,
    appliedFilters.status !== SELECT_ALL ? { key: "status", label: `Estado: ${REQUEST_STATUS_REPORT_OPTIONS.find((option) => option.value === appliedFilters.status)?.label ?? appliedFilters.status}`, clear: () => clearAppliedFilter("status", SELECT_ALL) } : null,
    appliedFilters.currency !== SELECT_ALL ? { key: "currency", label: `Moneda: ${appliedFilters.currency}`, clear: () => clearAppliedFilter("currency", SELECT_ALL) } : null,
    appliedFilters.orgUnitId !== SELECT_ALL ? { key: "org-unit", label: "Unidad organizacional", clear: () => clearAppliedFilter("orgUnitId", SELECT_ALL) } : null,
    appliedFilters.planningLineId !== SELECT_ALL ? { key: "planning-line", label: "Línea POA", clear: () => clearAppliedFilter("planningLineId", SELECT_ALL) } : null,
    appliedFilters.categoryId !== SELECT_ALL ? { key: "category", label: "Categoría", clear: () => clearAppliedFilter("categoryId", SELECT_ALL) } : null,
    appliedFilters.programId !== SELECT_ALL ? { key: "program", label: "Programa", clear: () => clearAppliedFilter("programId", SELECT_ALL) } : null,
    appliedFilters.territoryId !== SELECT_ALL ? { key: "territory", label: "Territorio", clear: () => clearAppliedFilter("territoryId", SELECT_ALL) } : null,
    appliedFilters.fundingSourceId !== SELECT_ALL ? { key: "funding-source", label: "Fuente de financiamiento", clear: () => clearAppliedFilter("fundingSourceId", SELECT_ALL) } : null,
    activeReport === REPORT_SECTION.EXPENSES_BY_CONCEPT && optionalText(appliedFilters.conceptSearch) ? { key: "concept-search", label: `Concepto: ${appliedFilters.conceptSearch}`, clear: () => clearAppliedFilter("conceptSearch", "") } : null,
    activeReport === REPORT_SECTION.EXPENSES_BY_CONCEPT && optionalText(appliedFilters.provider) ? { key: "provider", label: `Proveedor: ${appliedFilters.provider}`, clear: () => clearAppliedFilter("provider", "") } : null,
    activeReport === REPORT_SECTION.EXPENSES_BY_CONCEPT && optionalText(appliedFilters.minAmount) ? { key: "min-amount", label: `Monto mín.: ${appliedFilters.minAmount}`, clear: () => clearAppliedFilter("minAmount", "") } : null,
    activeReport === REPORT_SECTION.EXPENSES_BY_CONCEPT && optionalText(appliedFilters.maxAmount) ? { key: "max-amount", label: `Monto máx.: ${appliedFilters.maxAmount}`, clear: () => clearAppliedFilter("maxAmount", "") } : null,
    activeReport === REPORT_SECTION.EXPENSES_BY_CONCEPT && appliedFilters.detailsSort !== REPORT_SORT_FIELD.EXPENSE_DATE ? { key: "details-sort", label: `Orden: ${REPORT_SORT_OPTIONS.find((option) => option.value === appliedFilters.detailsSort)?.label ?? appliedFilters.detailsSort}`, clear: () => clearAppliedFilter("detailsSort", REPORT_SORT_FIELD.EXPENSE_DATE) } : null,
    activeReport === REPORT_SECTION.EXPENSES_BY_CONCEPT && appliedFilters.detailsDirection !== REPORT_SORT_DIRECTION.DESC ? { key: "details-direction", label: "Dirección: antiguos primero", clear: () => clearAppliedFilter("detailsDirection", REPORT_SORT_DIRECTION.DESC) } : null,
    activeReport === REPORT_SECTION.EXPENSES_BY_CONCEPT && appliedFilters.detailsLimit !== DEFAULT_DETAILS_LIMIT ? { key: "details-limit", label: `Detalle: ${appliedFilters.detailsLimit} por página`, clear: () => clearAppliedFilter("detailsLimit", DEFAULT_DETAILS_LIMIT) } : null,
  ].filter((chip): chip is { key: string; label: string; clear: () => void } => chip !== null);

  function clearAllFilters() {
    const defaults = createDefaultFilterFormState();
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setDetailsPage(1);
  }

  async function exportCurrentReport() {
    if (authIsLoading || !accessToken) {
      toast.error("Tu sesión no está disponible. Vuelve a iniciar sesión para exportar reportes.");
      return;
    }

    setIsExporting(true);
    try {
      const section = activeReport === REPORT_SECTION.EXPENSES_BY_CONCEPT ? REPORT_SECTION.EXPENSES_BY_CONCEPT : activeReport;
      const download = await downloadReport(section, filters);
      saveDownloadedReport(download, `${section}.xlsx`);
      toast.success("Reporte exportado correctamente.");
    } catch (error) {
      toast.error(error instanceof Error ? getReportApiErrorMessage(error) : "No se pudo exportar el reporte.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
          <p className="text-muted-foreground">Consulta indicadores de solicitudes y gastos, y descarga resultados para análisis operativo.</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {REPORT_TABS.map((tab) => (
          <button key={tab.value} type="button" onClick={() => setActiveReport(tab.value)} className={cn("rounded-lg border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md", activeReport === tab.value ? "border-primary ring-2 ring-primary" : "border-border")} aria-pressed={activeReport === tab.value}>
            <p className="font-semibold">{tab.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{tab.description}</p>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buscar y filtrar</CardTitle>
          <CardDescription>Usa la búsqueda y el rango de fechas para empezar. Los filtros específicos están agrupados en opciones avanzadas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_auto] lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="report-search">Búsqueda principal</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="report-search" className="pl-9" value={draftFilters.search} onChange={(event) => changeDraftFilter("search", event.target.value)} placeholder="Buscar por código, solicitante, concepto o detalle..." />
              </div>
            </div>
            <div className="space-y-2"><Label htmlFor="date-from">Desde</Label><Input id="date-from" type="date" value={draftFilters.dateFrom} onChange={(event) => changeDraftFilter("dateFrom", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="date-to">Hasta</Label><Input id="date-to" type="date" value={draftFilters.dateTo} onChange={(event) => changeDraftFilter("dateTo", event.target.value)} /></div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button type="button" variant="outline" onClick={() => setRefreshKey((current) => current + 1)}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Actualizar
              </Button>
              <Button onClick={() => void exportCurrentReport()} disabled={isExporting || authIsLoading || !accessToken}>
                {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Exportar
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t pt-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setAdvancedFiltersOpen((current) => !current)} aria-expanded={advancedFiltersOpen} data-testid="advanced-filters-toggle">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Filtros avanzados
                {activeFilterChips.length > 0 && <Badge className="ml-2" variant="secondary" data-testid="active-filter-count">{activeFilterChips.length}</Badge>}
              </Button>
              {activeFilterChips.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={clearAllFilters}>Limpiar filtros</Button>}
            </div>
            <p className="text-xs text-muted-foreground">Las fechas se interpretan según el calendario operativo de Lima. Puedes usar el mismo día como inicio y fin.</p>
          </div>

          {activeFilterChips.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Filtros activos">
              {activeFilterChips.map((chip) => (
                <Badge key={chip.key} variant="outline" className="gap-1 py-1 pr-1">
                  {chip.label}
                  <button type="button" className="rounded-full p-0.5 hover:bg-muted" onClick={chip.clear} aria-label={`Quitar filtro ${chip.label}`}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {advancedFiltersOpen && (
            <AdvancedFiltersPanel
              activeReport={activeReport}
              draftFilters={draftFilters}
              hasPendingChanges={hasPendingAdvancedFilters}
              onDraftChange={changeDraftFilter}
              onApply={applyDraftFilters}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><CardTitle>{activeTab.title}</CardTitle><CardDescription>{activeTab.description}</CardDescription></div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="h-3 w-3" /> La búsqueda y fechas se aplican automáticamente; los filtros avanzados requieren aplicar.</div>
        </CardHeader>
        <CardContent>
          <RequestsByStatusSection key={`status-${refreshKey}`} filters={filters} enabled={activeReport === REPORT_SECTION.REQUESTS_BY_STATUS} />
          <ExpensesByRequestTypeSection key={`type-${refreshKey}`} filters={filters} enabled={activeReport === REPORT_SECTION.EXPENSES_BY_REQUEST_TYPE} />
          <ExpensesByConceptSection key={`concept-${refreshKey}`} filters={filters} detailsFilters={detailsFilters} enabled={activeReport === REPORT_SECTION.EXPENSES_BY_CONCEPT} onPageChange={setDetailsPage} />
        </CardContent>
      </Card>
    </div>
  );
}
