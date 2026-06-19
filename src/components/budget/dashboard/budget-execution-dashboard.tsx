"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Banknote, CheckCircle2, Clock3, LineChart as LineChartIcon, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  CHART_COLORS,
  ChartContainer,
  DashboardLegend,
  DashboardTooltip,
} from "@/components/ui/chart";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetExecutionDashboardSkeleton } from "@/components/performance/route-skeletons";
import { useBudgetExecutionDashboard } from "@/hooks/use-dashboard";
import {
  chartNumberOrNull,
  formatMoneyStrict,
  formatMonthLabel,
  formatNumberStrict,
  formatPercentStrict,
  getBudgetDashboardAlertMessage,
  truncateChartLabel,
} from "@/lib/dashboard-formatters";
import { getTerritoryBusinessBadge, getTerritoryDisplayLabel } from "@/lib/dashboard-territory";
import { useBudgetBalanceStore } from "@/stores/budget-balance-store";
import type { BudgetDashboardAlert, BudgetDashboardBreakdownItem, BudgetDashboardExecution } from "@/types/dashboard";

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debouncedValue;
}

function RefreshingNotice() {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      Actualizando datos del dashboard sin ocultar la información visible...
    </div>
  );
}

function hasAnyBudgetData(data: BudgetDashboardExecution): boolean {
  return (
    data.totals.allocated !== 0 ||
    data.totals.committed !== 0 ||
    data.totals.executed !== 0 ||
    data.totals.available !== 0 ||
    data.totals.rendered !== null ||
    data.series.some((item) => item.planned !== 0 || item.executed !== 0 || item.rendered !== null) ||
    data.breakdowns.by_category.length > 0 ||
    data.breakdowns.by_program.length > 0 ||
    data.breakdowns.by_territory.length > 0
  );
}

function KpiCard({
  title,
  value,
  description,
  Icon,
}: {
  title: string;
  value: string;
  description: string;
  Icon: typeof Banknote;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="truncate text-xl font-bold tabular-nums xl:text-2xl" title={value}>{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function BudgetKpis({ data }: { data: BudgetDashboardExecution }) {
  const metrics = [
    { title: "Asignado", value: formatMoneyStrict(data.totals.allocated), description: "Aportes y presupuesto disponible", Icon: Banknote },
    { title: "Comprometido", value: formatMoneyStrict(data.totals.committed), description: "Solicitudes en compromiso", Icon: Clock3 },
    { title: "Pagado", value: formatMoneyStrict(data.totals.executed), description: "Ejecución pagada", Icon: CheckCircle2 },
    { title: "Rendido", value: formatMoneyStrict(data.totals.rendered), description: data.totals.rendered === null ? "Sin dato estructurado" : "Gasto rendido", Icon: LineChartIcon },
    { title: "Disponible", value: formatMoneyStrict(data.totals.available), description: "Asignado menos compromiso y ejecución", Icon: Wallet },
    { title: "% ejecución", value: formatPercentStrict(data.totals.execution_rate), description: data.totals.execution_rate === null ? "No aplica sin asignado" : "Pagado / asignado", Icon: AlertCircle },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-6">
      {metrics.map((metric) => (
        <KpiCard key={metric.title} {...metric} />
      ))}
    </div>
  );
}

function MonthlyChart({ data }: { data: BudgetDashboardExecution }) {
  const chartData = data.series.map((item) => ({
    month: formatMonthLabel(item.month),
    Planificado: item.planned,
    Pagado: item.executed,
    Rendido: chartNumberOrNull(item.rendered),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolución mensual</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer empty={chartData.length === 0} height={340}>
          <LineChart data={chartData} margin={{ left: 12, right: 24, top: 12, bottom: 24 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} interval={0} height={36} />
            <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 12 }} tickFormatter={(value) => formatMoneyStrict(Number(value))} width={104} />
            <DashboardTooltip valueFormat="money" />
            <DashboardLegend />
            <Line type="monotone" dataKey="Planificado" stroke={CHART_COLORS.redSoft} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Pagado" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Rendido" stroke={CHART_COLORS.green} strokeWidth={2} dot={false} connectNulls={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function getTopBreakdownRows(rows: BudgetDashboardBreakdownItem[], limit = 6) {
  const sortedRows = [...rows].sort((first, second) => second.executed - first.executed);
  const topRows = sortedRows.slice(0, limit);
  const remainingRows = sortedRows.slice(limit);

  if (remainingRows.length === 0) return topRows;

  const planned = remainingRows.reduce((total, row) => total + row.planned, 0);
  const committed = remainingRows.reduce((total, row) => total + row.committed, 0);
  const executed = remainingRows.reduce((total, row) => total + row.executed, 0);
  const renderedValues = remainingRows.map((row) => row.rendered).filter((value): value is number => value !== null);
  const rendered = renderedValues.length === 0 ? null : renderedValues.reduce((total, value) => total + value, 0);

  return [
    ...topRows,
    {
      id: "__otros__",
      label: `Otros (${formatNumberStrict(remainingRows.length)})`,
      planned,
      committed,
      executed,
      rendered,
      execution_rate: planned === 0 ? null : executed / planned,
    },
  ];
}

function BreakdownBars({ title, rows }: { title: string; rows: BudgetDashboardBreakdownItem[] }) {
  const displayRows = getTopBreakdownRows(rows);
  const chartData = displayRows.map((row) => ({
    name: truncateChartLabel(getTerritoryDisplayLabel(row), 28),
    fullName: getTerritoryDisplayLabel(row),
    Planificado: row.planned,
    Ejecutado: row.executed,
  }));
  const chartHeight = Math.max(320, chartData.length * 52 + 96);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {rows.length > 6 && (
          <p className="text-sm text-muted-foreground">Se muestran los principales por ejecución; el resto se agrupa en Otros.</p>
        )}
      </CardHeader>
      <CardContent>
        <ChartContainer empty={chartData.length === 0} emptyMessage="Sin datos para los filtros seleccionados" height={chartHeight}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 12, right: 24, top: 12, bottom: 24 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} tickFormatter={(value) => formatMoneyStrict(Number(value))} height={44} />
            <YAxis type="category" dataKey="name" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} width={190} />
            <DashboardTooltip valueFormat="money" />
            <DashboardLegend />
            <Bar dataKey="Planificado" fill={CHART_COLORS.redSoft} radius={[0, 4, 4, 0]} />
            <Bar dataKey="Ejecutado" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function TerritoryTable({ rows }: { rows: BudgetDashboardBreakdownItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ejecución por territorio</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Sin datos para los filtros seleccionados
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Territorio</th>
                  <th className="py-2 pr-3 text-right font-medium">Planificado</th>
                  <th className="py-2 pr-3 text-right font-medium">Ejecutado</th>
                  <th className="py-2 pr-3 text-right font-medium">Rendido</th>
                  <th className="py-2 text-right font-medium">% ejecución</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((row) => {
                  const displayLabel = getTerritoryDisplayLabel(row);
                  const badgeLabel = getTerritoryBusinessBadge(row);
                  return (
                    <tr key={row.id ?? row.label} className="border-b border-border/60 last:border-0">
                      <td className="max-w-72 py-2 pr-3 font-medium">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="block truncate" title={displayLabel}>{displayLabel}</span>
                          <span className="flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted-foreground">
                            {badgeLabel && (
                              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                                {badgeLabel}
                              </span>
                            )}
                            {row.territory_ubigeo_code && <span>UBIGEO {row.territory_ubigeo_code}</span>}
                            {row.territory_code && !row.territory_ubigeo_code && <span>{row.territory_code}</span>}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatMoneyStrict(row.planned)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatMoneyStrict(row.executed)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatMoneyStrict(row.rendered)}</td>
                      <td className="py-2 text-right tabular-nums">{formatPercentStrict(row.execution_rate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function BudgetExecutionDashboard() {
  const fiscalYearId = useBudgetBalanceStore((state) => state.fiscalYearId);
  const filters = useBudgetBalanceStore((state) => state.filters);
  const dashboardFilters = fiscalYearId
    ? {
        fiscal_year_id: fiscalYearId,
        org_unit_id: filters.org_unit_id,
        territory_id: filters.territory_id,
      }
    : null;
  const debouncedFilters = useDebouncedValue(dashboardFilters, 250);
  const { data, isLoading, isRefreshing, error } = useBudgetExecutionDashboard(debouncedFilters);

  if (!fiscalYearId || (isLoading && !data)) {
    return <BudgetExecutionDashboardSkeleton />;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Error al cargar el dashboard de ejecución: {error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Sin datos para los filtros seleccionados
      </div>
    );
  }

  const hasData = hasAnyBudgetData(data);
  const displayAlerts = data.alerts
    .filter((alert) => alert.severity !== "info")
    .map((alert) => ({ alert, message: getBudgetDashboardAlertMessage(alert) }))
    .filter((item): item is { alert: BudgetDashboardAlert; message: string } => item.message !== null);

  return (
    <div className="space-y-6">
      {isRefreshing && <RefreshingNotice />}
      {!hasData && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Sin datos para los filtros seleccionados
        </div>
      )}
      {displayAlerts.map(({ alert, message }) => (
        <Alert key={`${alert.code}-${message}`} variant={alert.severity === "critical" ? "destructive" : "default"}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ))}
      <BudgetKpis data={data} />
      <MonthlyChart data={data} />
      <BreakdownBars title="Ejecución por categoría" rows={data.breakdowns.by_category} />
      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownBars title="Ejecución por programa" rows={data.breakdowns.by_program} />
        <TerritoryTable rows={data.breakdowns.by_territory} />
      </div>
    </div>
  );
}
