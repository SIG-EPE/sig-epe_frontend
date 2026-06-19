"use client";

import { ArrowLeft, BarChart3, Calculator, CheckCircle2, Search, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useEffect, useState } from "react";

import { CHART_COLORS, ChartContainer, DashboardLegend, DashboardTooltip } from "@/components/ui/chart";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgUnitExecutionDashboard, useOrgUnitExecutionDashboardOptions } from "@/hooks/use-dashboard";
import { formatMoneyStrict, formatMonthLabel, formatPercentStrict, truncateChartLabel } from "@/lib/dashboard-formatters";
import { formatBusinessName } from "@/lib/ui-labels";
import { ORG_UNIT_EXECUTION_LEVEL, type OrgUnitExecutionLevel, type OrgUnitExecutionOption, type OrgUnitExecutionRow } from "@/types/dashboard";

const LEVEL_LABEL: Record<OrgUnitExecutionLevel, string> = {
  area: "Unidad orgánica",
  component: "Componente",
  operative_action: "Acción operativa",
  resource: "Recurso",
};

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
  showCode = true,
  onChange,
}: {
  label: string;
  value: string;
  options: OrgUnitExecutionOption[];
  placeholder: string;
  disabledMessage: string;
  showCode?: boolean;
  onChange: (value: string) => void;
}) {
  const disabled = options.length === 0;
  return (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">{disabled ? disabledMessage : placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{showCode && option.code ? `${option.code} · ${formatBusinessName(option.label)}` : formatBusinessName(option.label)}</option>
        ))}
      </select>
    </label>
  );
}

export function OrgUnitExecutionDashboard() {
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [orgUnitId, setOrgUnitId] = useState("");
  const [programId, setProgramId] = useState("");
  const [componentId, setComponentId] = useState("");
  const [operativeActionId, setOperativeActionId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [fundingSourceId, setFundingSourceId] = useState("");
  const [search, setSearch] = useState("");
  const [topN, setTopN] = useState("12");
  const [level, setLevel] = useState<OrgUnitExecutionLevel>(ORG_UNIT_EXECUTION_LEVEL.AREA);
  const [parentId, setParentId] = useState<string | undefined>();
  const [trail, setTrail] = useState<Array<{ level: OrgUnitExecutionLevel; parentId?: string; label: string }>>([]);
  const debouncedSearch = useDebouncedValue(search.trim(), 350);
  const debouncedTopN = useDebouncedValue(topN.trim(), 350);
  const parsedTopN = Number(debouncedTopN);

  const filters = {
    fiscal_year: Number(fiscalYear),
    selected_month: Number(selectedMonth),
    org_unit_id: orgUnitId || undefined,
    program_id: programId || undefined,
    component_id: componentId || undefined,
    operative_action_id: operativeActionId || undefined,
    resource_id: resourceId || undefined,
    funding_source_id: fundingSourceId || undefined,
    search: debouncedSearch || undefined,
    top_n: Number.isFinite(parsedTopN) && parsedTopN > 0 ? parsedTopN : 12,
    level,
    parent_id: parentId,
  };

  const { data, isLoading, isRefreshing, error } = useOrgUnitExecutionDashboard(filters);
  const { data: optionsData, isLoading: optionsLoading, isRefreshing: optionsRefreshing } = useOrgUnitExecutionDashboardOptions(filters);
  const options = optionsData?.options ?? data?.filter_options;

  function resetDrilldown() {
    setLevel(ORG_UNIT_EXECUTION_LEVEL.AREA);
    setParentId(undefined);
    setTrail([]);
  }

  function clearFrom(parent: "org" | "program" | "component" | "action" | "resource") {
    if (parent === "org") {
      setProgramId("");
      setComponentId("");
      setOperativeActionId("");
      setResourceId("");
    }
    if (parent === "program") {
      setComponentId("");
      setOperativeActionId("");
      setResourceId("");
    }
    if (parent === "component") {
      setOperativeActionId("");
      setResourceId("");
    }
    if (parent === "action") setResourceId("");
    resetDrilldown();
  }

  function drillDown(row: OrgUnitExecutionRow) {
    const childLevel = nextLevel(level);
    if (!childLevel || !row.id) return;
    setTrail((current) => [...current, { level, parentId, label: row.name }]);
    setLevel(childLevel);
    setParentId(row.id);
  }

  function goBack() {
    const previous = trail.at(-1);
    if (!previous) return;
    setLevel(previous.level);
    setParentId(previous.parentId);
    setTrail((current) => current.slice(0, -1));
  }

  if (isLoading && !data) {
    return <Skeleton className="h-96 rounded-xl" />;
  }

  const rows = data?.rows ?? [];
  const topRows = rows.slice(0, 8);
  const kpis = data?.kpis;
  const monthLabel = formatMonthLabel(Number(selectedMonth)).toLowerCase();
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
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Año fiscal</span>
            <input className="w-full rounded-md border border-input bg-background px-3 py-2" value={fiscalYear} onChange={(event) => setFiscalYear(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Mes seleccionado</span>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{formatMonthLabel(month)}</option>)}
            </select>
          </label>
          <FilterSelect label="Unidad orgánica" value={orgUnitId} options={options?.org_units ?? []} placeholder="Todas las unidades" disabledMessage={optionsLoading ? "Cargando..." : "Sin unidades"} showCode={false} onChange={(value) => { setOrgUnitId(value); clearFrom("org"); }} />
          <FilterSelect label="Programa" value={programId} options={options?.programs ?? []} placeholder="Todos los programas" disabledMessage="Sin programas" onChange={(value) => { setProgramId(value); clearFrom("program"); }} />
          <FilterSelect label="Componente" value={componentId} options={options?.components ?? []} placeholder="Todos los componentes" disabledMessage="Sin componentes" onChange={(value) => { setComponentId(value); clearFrom("component"); }} />
          <FilterSelect label="Acción operativa" value={operativeActionId} options={options?.operative_actions ?? []} placeholder="Todas las acciones" disabledMessage="Sin acciones" onChange={(value) => { setOperativeActionId(value); clearFrom("action"); }} />
          <FilterSelect label="Recurso" value={resourceId} options={options?.resources ?? []} placeholder="Todos los recursos" disabledMessage="Sin recursos" onChange={(value) => { setResourceId(value); clearFrom("resource"); }} />
          <FilterSelect label="Fuente" value={fundingSourceId} options={options?.funding_sources ?? []} placeholder="Todas las fuentes" disabledMessage="Sin fuentes" onChange={(value) => { setFundingSourceId(value); resetDrilldown(); }} />
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Nivel</span>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={level} onChange={(event) => { setLevel(event.target.value as OrgUnitExecutionLevel); setParentId(undefined); setTrail([]); }}>
              {Object.values(ORG_UNIT_EXECUTION_LEVEL).map((value) => <option key={value} value={value}>{LEVEL_LABEL[value]}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-muted-foreground">Buscar</span>
            <span className="flex items-center rounded-md border border-input bg-background px-3 py-2">
              <Search className="mr-2 h-4 w-4 text-muted-foreground" />
              <input className="w-full bg-transparent outline-none" value={search} placeholder="Código, recurso, acción..." onChange={(event) => setSearch(event.target.value)} />
            </span>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Top N</span>
            <input className="w-full rounded-md border border-input bg-background px-3 py-2" value={topN} onChange={(event) => setTopN(event.target.value)} />
          </label>
        </CardContent>
      </Card>

      {error && <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>}
      {(isRefreshing || optionsRefreshing) && data && <p className="text-xs text-muted-foreground">Actualizando dashboard en segundo plano...</p>}
      {data?.warnings.map((warning) => <Alert key={warning.code}><AlertDescription>{warning.message}</AlertDescription></Alert>)}

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
              <CardTitle>Comparación por {LEVEL_LABEL[level].toLowerCase()}</CardTitle>
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
                        <th className="py-2 pr-3 font-medium">{LEVEL_LABEL[level]}</th>
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
                            {row.has_children && nextLevel(level) ? <button className="text-left text-primary hover:underline" onClick={() => drillDown(row)}>{row.name}</button> : row.name}
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
