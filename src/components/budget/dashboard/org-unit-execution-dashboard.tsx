"use client";

import { ArrowLeft, BarChart3, Calculator, CheckCircle2, Download, Loader2, Search, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CHART_COLORS, ChartContainer, DashboardLegend, DashboardTooltip } from "@/components/ui/chart";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgUnitExecutionDashboard, useOrgUnitExecutionDashboardOptions } from "@/hooks/use-dashboard";
import { ApiRequestError } from "@/lib/api-client";
import { downloadOrgUnitExecutionReport, saveDownloadedDashboardReport } from "@/lib/dashboard";
import { formatMoneyStrict, formatMonthLabel, formatPercentStrict, truncateChartLabel } from "@/lib/dashboard-formatters";
import { formatBusinessName } from "@/lib/ui-labels";
import { ORG_UNIT_EXECUTION_LEVEL, type OrgUnitExecutionDashboardFilters, type OrgUnitExecutionLevel, type OrgUnitExecutionOption, type OrgUnitExecutionRow } from "@/types/dashboard";

const LEVEL_LABEL: Record<OrgUnitExecutionLevel, string> = {
  area: "Unidad orgánica",
  component: "Componente",
  operative_action: "Acción operativa",
  resource: "Recurso",
};

interface DraftFilters {
  fiscalYear: string;
  selectedMonth: string;
  orgUnitId: string;
  programId: string;
  componentId: string;
  operativeActionId: string;
  resourceId: string;
  fundingSourceId: string;
  search: string;
  topN: string;
  level: OrgUnitExecutionLevel;
}

function createInitialDraftFilters(): DraftFilters {
  return {
    fiscalYear: String(new Date().getFullYear()),
    selectedMonth: String(new Date().getMonth() + 1),
    orgUnitId: "",
    programId: "",
    componentId: "",
    operativeActionId: "",
    resourceId: "",
    fundingSourceId: "",
    search: "",
    topN: "12",
    level: ORG_UNIT_EXECUTION_LEVEL.AREA,
  };
}

function toDashboardFilters(draftFilters: DraftFilters, overrides: Partial<OrgUnitExecutionDashboardFilters> = {}): OrgUnitExecutionDashboardFilters {
  const parsedTopN = Number(draftFilters.topN.trim());
  return {
    fiscal_year: Number(draftFilters.fiscalYear),
    selected_month: Number(draftFilters.selectedMonth),
    org_unit_id: draftFilters.orgUnitId || undefined,
    program_id: draftFilters.programId || undefined,
    component_id: draftFilters.componentId || undefined,
    operative_action_id: draftFilters.operativeActionId || undefined,
    resource_id: draftFilters.resourceId || undefined,
    funding_source_id: draftFilters.fundingSourceId || undefined,
    search: draftFilters.search.trim() || undefined,
    top_n: Number.isFinite(parsedTopN) && parsedTopN > 0 ? parsedTopN : 12,
    level: draftFilters.level,
    parent_id: undefined,
    ...overrides,
  };
}

function filtersSignature(filters: OrgUnitExecutionDashboardFilters | null): string {
  return JSON.stringify(filters ?? null);
}

function getExportErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 400) {
      const bodyMessage = Array.isArray(error.body.message) ? error.body.message.join(" ") : error.body.message;
      if (/org_unit|unidad org[aá]nica/i.test(bodyMessage)) {
        return "Selecciona y aplica una unidad orgánica antes de descargar el Excel.";
      }
      return "Revisa los filtros aplicados e inténtalo nuevamente.";
    }
    if (error.status === 401) return "Tu sesión no está disponible. Vuelve a iniciar sesión para descargar el Excel.";
    if (error.status === 403) return "No tienes permisos para descargar este Excel.";
  }

  return error instanceof Error ? error.message : "No se pudo descargar el Excel. Inténtalo nuevamente.";
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debouncedValue;
}

function nextLevel(level: OrgUnitExecutionLevel): OrgUnitExecutionLevel | null {
  if (level === ORG_UNIT_EXECUTION_LEVEL.AREA) return ORG_UNIT_EXECUTION_LEVEL.COMPONENT;
  if (level === ORG_UNIT_EXECUTION_LEVEL.COMPONENT) return ORG_UNIT_EXECUTION_LEVEL.OPERATIVE_ACTION;
  if (level === ORG_UNIT_EXECUTION_LEVEL.OPERATIVE_ACTION) return ORG_UNIT_EXECUTION_LEVEL.RESOURCE;
  return null;
}

function KpiCard({ title, value, description, Icon }: { title: string; value: string; description: string; Icon: typeof Wallet }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  options,
  placeholder,
  disabledMessage,
  disabled = false,
  showCode = true,
  onChange,
}: {
  label: string;
  value: string;
  options: OrgUnitExecutionOption[];
  placeholder: string;
  disabledMessage: string;
  disabled?: boolean;
  showCode?: boolean;
  onChange: (value: string) => void;
}) {
  const isDisabled = disabled || options.length === 0;
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={value} disabled={isDisabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">{isDisabled ? disabledMessage : placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{showCode && option.code ? `${option.code} · ${formatBusinessName(option.label)}` : formatBusinessName(option.label)}</option>
        ))}
      </select>
    </label>
  );
}

export function OrgUnitExecutionDashboard() {
  const [draftFilters, setDraftFilters] = useState<DraftFilters>(() => createInitialDraftFilters());
  const [appliedFilters, setAppliedFilters] = useState<OrgUnitExecutionDashboardFilters | null>(null);
  const [validationMessage, setValidationMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [trail, setTrail] = useState<Array<{ level: OrgUnitExecutionLevel; parentId?: string; label: string }>>([]);
  const debouncedDraftSearch = useDebouncedValue(draftFilters.search.trim(), 350);
  const debouncedDraftTopN = useDebouncedValue(draftFilters.topN.trim(), 350);
  const draftOptionFilters = toDashboardFilters({ ...draftFilters, search: debouncedDraftSearch, topN: debouncedDraftTopN });
  const canLoadDashboard = Boolean(appliedFilters?.org_unit_id);
  const { data, isLoading, isRefreshing, error } = useOrgUnitExecutionDashboard(appliedFilters, { enabled: canLoadDashboard });
  const { data: optionsData, isLoading: optionsLoading, isRefreshing: optionsRefreshing } = useOrgUnitExecutionDashboardOptions(draftOptionFilters, { enabled: true });
  const options = optionsData?.options;
  const hasAppliedFilters = appliedFilters !== null;
  const canExport = Boolean(appliedFilters?.org_unit_id);
  const hasPendingChanges = hasAppliedFilters && filtersSignature(toDashboardFilters(draftFilters)) !== filtersSignature({ ...appliedFilters, parent_id: undefined });
  const activeLevel = appliedFilters?.level ?? draftFilters.level;

  function resetDrilldown() {
    setTrail([]);
  }

  function clearFrom(parent: "org" | "program" | "component" | "action" | "resource") {
    resetDrilldown();
  }

  function updateDraft(updates: Partial<DraftFilters>) {
    setDraftFilters((current) => ({ ...current, ...updates }));
    setValidationMessage("");
  }

  function applyFilters() {
    if (!draftFilters.orgUnitId) {
      setValidationMessage("Selecciona una unidad orgánica para cargar el análisis.");
      return;
    }
    const nextFilters = toDashboardFilters(draftFilters);
    setAppliedFilters(nextFilters);
    setTrail([]);
    setValidationMessage("");
  }

  function resetFilters() {
    setDraftFilters((current) => ({ ...createInitialDraftFilters(), fiscalYear: current.fiscalYear, selectedMonth: current.selectedMonth }));
    setAppliedFilters(null);
    setTrail([]);
    setValidationMessage("");
  }

  function drillDown(row: OrgUnitExecutionRow) {
    const childLevel = nextLevel(activeLevel);
    if (!childLevel || !row.id) return;
    const rowId = row.id;
    setTrail((current) => [...current, { level: activeLevel, parentId: appliedFilters?.parent_id ?? undefined, label: row.name }]);
    setAppliedFilters((current) => current ? { ...current, level: childLevel, parent_id: rowId } : current);
  }

  function goBack() {
    const previous = trail.at(-1);
    if (!previous) return;
    setAppliedFilters((current) => current ? { ...current, level: previous.level, parent_id: previous.parentId } : current);
    setTrail((current) => current.slice(0, -1));
  }

  async function exportExcel() {
    if (!appliedFilters?.org_unit_id) {
      toast.error("Selecciona y aplica una unidad orgánica antes de descargar el Excel.");
      return;
    }

    setIsExporting(true);
    try {
      const download = await downloadOrgUnitExecutionReport(appliedFilters);
      saveDownloadedDashboardReport(download, "programado-ejecutado.xlsx");
      toast.success("Excel de Programado vs Ejecutado descargado correctamente.");
    } catch (error) {
      toast.error(getExportErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  }

  const rows = data?.rows ?? [];
  const topRows = rows.slice(0, 8);
  const kpis = data?.kpis;
  const monthLabel = formatMonthLabel(Number(appliedFilters?.selected_month ?? draftFilters.selectedMonth)).toLowerCase();
  const chartData = topRows.map((row) => ({
    name: truncateChartLabel(row.name, 28),
    fullName: row.name,
    Programado: row.programmed,
    Ejecutado: row.executed,
  }));
  const varianceData = (data?.no_ejecutado_rows ?? rows).slice(0, 8).map((row) => ({
    name: truncateChartLabel(row.name, 28),
    fullName: row.name,
    "No ejecutado": "not_executed" in row ? row.not_executed : Math.max(row.variance, 0),
    Excedente: "excedente" in row ? row.excedente : Math.max(-row.variance, 0),
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Filtros de ejecución presupuestal</CardTitle>
          <p className="text-sm text-muted-foreground">Define qué quieres analizar. La unidad orgánica es necesaria para cargar Programado vs Ejecutado.</p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Año fiscal</span>
            <input className="w-full rounded-md border border-input bg-background px-3 py-2" value={draftFilters.fiscalYear} onChange={(event) => updateDraft({ fiscalYear: event.target.value, orgUnitId: "", programId: "", componentId: "", operativeActionId: "", resourceId: "", fundingSourceId: "" })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Mes seleccionado</span>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={draftFilters.selectedMonth} onChange={(event) => updateDraft({ selectedMonth: event.target.value, orgUnitId: "", programId: "", componentId: "", operativeActionId: "", resourceId: "", fundingSourceId: "" })}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{formatMonthLabel(month)}</option>)}
            </select>
          </label>
          <FilterSelect label="Unidad orgánica" value={draftFilters.orgUnitId} options={options?.org_units ?? []} placeholder="Selecciona una unidad" disabledMessage={optionsLoading ? "Cargando..." : "Sin unidades"} showCode={false} onChange={(value) => { updateDraft({ orgUnitId: value, programId: "", componentId: "", operativeActionId: "", resourceId: "", fundingSourceId: "" }); clearFrom("org"); }} />
          <FilterSelect label="Programa" value={draftFilters.programId} options={options?.programs ?? []} placeholder="Todos los programas" disabled={!draftFilters.orgUnitId} disabledMessage={!draftFilters.orgUnitId ? "Elige una unidad" : "Sin programas"} onChange={(value) => { updateDraft({ programId: value, componentId: "", operativeActionId: "", resourceId: "" }); clearFrom("program"); }} />
          <FilterSelect label="Componente" value={draftFilters.componentId} options={options?.components ?? []} placeholder="Todos los componentes" disabled={!draftFilters.programId} disabledMessage={!draftFilters.programId ? "Elige un programa" : "Sin componentes"} onChange={(value) => { updateDraft({ componentId: value, operativeActionId: "", resourceId: "" }); clearFrom("component"); }} />
          <FilterSelect label="Acción operativa" value={draftFilters.operativeActionId} options={options?.operative_actions ?? []} placeholder="Todas las acciones" disabled={!draftFilters.componentId} disabledMessage={!draftFilters.componentId ? "Elige un componente" : "Sin acciones"} onChange={(value) => { updateDraft({ operativeActionId: value, resourceId: "" }); clearFrom("action"); }} />
          <FilterSelect label="Recurso" value={draftFilters.resourceId} options={options?.resources ?? []} placeholder="Todos los recursos" disabled={!draftFilters.operativeActionId} disabledMessage={!draftFilters.operativeActionId ? "Elige una acción" : "Sin recursos"} onChange={(value) => { updateDraft({ resourceId: value }); clearFrom("resource"); }} />
          <FilterSelect label="Fuente" value={draftFilters.fundingSourceId} options={options?.funding_sources ?? []} placeholder="Todas las fuentes" disabledMessage="Sin fuentes" onChange={(value) => { updateDraft({ fundingSourceId: value }); resetDrilldown(); }} />
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Nivel</span>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={draftFilters.level} onChange={(event) => { updateDraft({ level: event.target.value as OrgUnitExecutionLevel }); resetDrilldown(); }}>
              {Object.values(ORG_UNIT_EXECUTION_LEVEL).map((value) => <option key={value} value={value}>{LEVEL_LABEL[value]}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-muted-foreground">Buscar</span>
            <span className="flex items-center rounded-md border border-input bg-background px-3 py-2">
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              <input className="w-full bg-transparent outline-none" value={draftFilters.search} placeholder="Código, recurso, acción..." onChange={(event) => updateDraft({ search: event.target.value })} />
            </span>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Top N</span>
            <input className="w-full rounded-md border border-input bg-background px-3 py-2" value={draftFilters.topN} onChange={(event) => updateDraft({ topN: event.target.value })} />
          </label>
          <div className="flex items-end gap-2 md:col-span-2">
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="button" onClick={applyFilters}>Aplicar filtros</button>
            <button className="rounded-md border px-4 py-2 text-sm" type="button" onClick={resetFilters}>Limpiar filtros</button>
            <button className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={() => void exportExcel()} disabled={!canExport || isExporting}>
              {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {isExporting ? "Exportando..." : "Descargar Excel"}
            </button>
          </div>
        </CardContent>
      </Card>

      {validationMessage && <Alert variant="destructive"><AlertDescription>{validationMessage}</AlertDescription></Alert>}
      {hasPendingChanges && <Alert><AlertDescription>Tienes cambios sin aplicar. Presiona “Aplicar filtros” para actualizar el análisis.</AlertDescription></Alert>}

      {error && <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>}
      {optionsRefreshing && <p className="text-xs text-muted-foreground">Actualizando filtros disponibles...</p>}
      {isRefreshing && data && <p className="text-xs text-muted-foreground">Actualizando análisis en segundo plano...</p>}
      {data?.warnings.map((warning) => <Alert key={warning.code}><AlertDescription>{warning.message}</AlertDescription></Alert>)}

      {hasAppliedFilters && isLoading && !data && <Skeleton className="h-96 rounded-xl" />}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard title="Presupuesto anual" value={formatMoneyStrict(kpis?.annual_programmed ?? data.totals.programmed)} description="Presupuesto total del año fiscal" Icon={Wallet} />
            <KpiCard title={`Presupuesto hasta ${monthLabel}`} value={formatMoneyStrict(kpis?.period_programmed ?? data.totals.programmed)} description="Programado de enero al mes seleccionado" Icon={Calculator} />
            <KpiCard title={`Ejecutado hasta ${monthLabel}`} value={formatMoneyStrict(kpis?.period_executed ?? data.totals.executed)} description="Pagado o rendido según POA" Icon={CheckCircle2} />
            <KpiCard title="% ejecutado" value={formatPercentStrict(kpis?.execution_rate ?? data.totals.execution_rate)} description="Ejecutado / programado del periodo" Icon={BarChart3} />
            <KpiCard title="No ejecutado" value={formatMoneyStrict(kpis?.not_executed ?? Math.max(data.totals.variance, 0))} description={`Pendiente hasta ${monthLabel}`} Icon={Calculator} />
            <KpiCard title="Excedente" value={formatMoneyStrict(kpis?.excedente ?? Math.max(-data.totals.variance, 0))} description="Sobre-ejecución del periodo" Icon={BarChart3} />
            <KpiCard title="Presupuesto meses restantes" value={formatMoneyStrict(kpis?.remaining_programmed ?? 0)} description={`Posterior a ${monthLabel}`} Icon={Wallet} />
            <KpiCard title="Semántica" value="POA" description="Ejecución poa_spent_v1" Icon={CheckCircle2} />
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Comparación por {LEVEL_LABEL[activeLevel].toLowerCase()}</CardTitle>
              {trail.length > 0 && <button className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm" onClick={goBack}><ArrowLeft className="h-4 w-4" /> Volver</button>}
            </CardHeader>
            <CardContent>
              <ChartContainer empty={chartData.length === 0} emptyMessage="Sin datos para los filtros seleccionados" height={Math.max(320, chartData.length * 48 + 100)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 12, right: 24, top: 12, bottom: 24 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} tickFormatter={(value) => formatMoneyStrict(Number(value))} />
                  <YAxis type="category" dataKey="name" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} width={190} />
                  <DashboardTooltip valueFormat="money" />
                  <DashboardLegend />
                  <Bar dataKey="Programado" fill={CHART_COLORS.redSoft} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Ejecutado" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>No ejecutado / Excedente</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer empty={varianceData.length === 0} emptyMessage="Sin diferencias para los filtros seleccionados" height={Math.max(280, varianceData.length * 44 + 90)}>
                <BarChart data={varianceData} layout="vertical" margin={{ left: 12, right: 24, top: 12, bottom: 24 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} tickFormatter={(value) => formatMoneyStrict(Number(value))} />
                  <YAxis type="category" dataKey="name" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} width={190} />
                  <DashboardTooltip valueFormat="money" />
                  <DashboardLegend />
                  <Bar dataKey="No ejecutado" fill={CHART_COLORS.amber} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Excedente" fill={CHART_COLORS.redDark} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Detalle</CardTitle></CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sin datos para los filtros seleccionados</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="py-2 pr-3 font-medium">{LEVEL_LABEL[activeLevel]}</th>
                        <th className="py-2 pr-3 text-right font-medium">Programado</th>
                        <th className="py-2 pr-3 text-right font-medium">Ejecutado</th>
                        <th className="py-2 pr-3 text-right font-medium">Diferencia</th>
                        <th className="py-2 pr-3 text-right font-medium">No ejecutado / Excedente</th>
                        <th className="py-2 text-right font-medium">% de ejecución</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={`${row.level}-${row.id ?? row.name}`} className="border-b border-border/60 last:border-0">
                          <td className="max-w-96 py-2 pr-3 font-medium">
                            {row.has_children && nextLevel(activeLevel) ? <button className="text-left text-primary hover:underline" onClick={() => drillDown(row)}>{row.name}</button> : row.name}
                            {row.code && <div className="text-xs font-normal text-muted-foreground">{row.code}</div>}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatMoneyStrict(row.programmed)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatMoneyStrict(row.executed)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatMoneyStrict(row.variance)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{row.variance >= 0 ? `No ejecutado ${formatMoneyStrict(row.variance)}` : `Excedente ${formatMoneyStrict(Math.abs(row.variance))}`}</td>
                          <td className="py-2 text-right tabular-nums">{formatPercentStrict(row.execution_rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
