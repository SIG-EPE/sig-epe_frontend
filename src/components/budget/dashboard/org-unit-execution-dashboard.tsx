"use client";

import { ArrowLeft, BarChart3, Calculator, CheckCircle2, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useState } from "react";

import { CHART_COLORS, ChartContainer, DashboardLegend, DashboardTooltip } from "@/components/ui/chart";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgUnitExecutionDashboard } from "@/hooks/use-dashboard";
import { formatMoneyStrict, formatMonthLabel, formatPercentStrict, truncateChartLabel } from "@/lib/dashboard-formatters";
import { ORG_UNIT_EXECUTION_LEVEL, type OrgUnitExecutionLevel, type OrgUnitExecutionRow } from "@/types/dashboard";

const LEVEL_LABEL: Record<OrgUnitExecutionLevel, string> = {
  area: "Unidad orgánica",
  component: "Componente",
  operative_action: "Acción operativa",
  resource: "Recurso",
};

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

export function OrgUnitExecutionDashboard() {
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [monthFrom, setMonthFrom] = useState("1");
  const [monthTo, setMonthTo] = useState("12");
  const [level, setLevel] = useState<OrgUnitExecutionLevel>(ORG_UNIT_EXECUTION_LEVEL.AREA);
  const [parentId, setParentId] = useState<string | undefined>();
  const [trail, setTrail] = useState<Array<{ level: OrgUnitExecutionLevel; parentId?: string; label: string }>>([]);

  const { data, isLoading, error } = useOrgUnitExecutionDashboard({
    fiscal_year: Number(fiscalYear),
    month_from: Number(monthFrom),
    month_to: Number(monthTo),
    level,
    parent_id: parentId,
  });

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
  const chartData = topRows.map((row) => ({
    name: truncateChartLabel(row.name, 28),
    fullName: row.name,
    Programado: row.programmed,
    Ejecutado: row.executed,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Año fiscal</span>
            <input className="w-full rounded-md border border-input bg-background px-3 py-2" value={fiscalYear} onChange={(event) => setFiscalYear(event.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Mes desde</span>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={monthFrom} onChange={(event) => setMonthFrom(event.target.value)}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{formatMonthLabel(month)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Mes hasta</span>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={monthTo} onChange={(event) => setMonthTo(event.target.value)}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{formatMonthLabel(month)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Nivel</span>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={level} onChange={(event) => { setLevel(event.target.value as OrgUnitExecutionLevel); setParentId(undefined); setTrail([]); }}>
              {Object.values(ORG_UNIT_EXECUTION_LEVEL).map((value) => <option key={value} value={value}>{LEVEL_LABEL[value]}</option>)}
            </select>
          </label>
        </CardContent>
      </Card>

      {error && <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>}
      {data?.warnings.map((warning) => <Alert key={warning.code}><AlertDescription>{warning.message}</AlertDescription></Alert>)}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard title="Programado" value={formatMoneyStrict(data.totals.programmed)} description="Monto planificado en POA" Icon={Wallet} />
            <KpiCard title="Ejecutado" value={formatMoneyStrict(data.totals.executed)} description="Pagado o rendido según corresponda" Icon={CheckCircle2} />
            <KpiCard title="Diferencia" value={formatMoneyStrict(data.totals.variance)} description="Programado menos ejecutado" Icon={Calculator} />
            <KpiCard title="% de ejecución" value={formatPercentStrict(data.totals.execution_rate)} description="Ejecutado / programado" Icon={BarChart3} />
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
