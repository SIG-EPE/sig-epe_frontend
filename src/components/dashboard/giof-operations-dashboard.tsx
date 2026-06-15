"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FileText, RefreshCw, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  CHART_COLORS,
  ChartContainer,
  DashboardLegend,
  DashboardTooltip,
} from "@/components/ui/chart";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useGiofOperationsDashboard } from "@/hooks/use-dashboard";
import {
  formatMoneyStrict,
  formatNumberStrict,
  formatPercentStrict,
  getGiofExceptionLabel,
  getRequestStatusDashboardLabel,
} from "@/lib/dashboard-formatters";
import type { GiofOperationsDashboard } from "@/types/dashboard";

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[1, 2, 3, 4, 5].map((item) => (
          <Skeleton key={item} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

function KpiCard({ title, value, description, Icon }: { title: string; value: string; description: string; Icon: typeof FileText }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function GiofFilters({
  dateFrom,
  dateTo,
  fiscalYear,
  onDateFromChange,
  onDateToChange,
  onFiscalYearChange,
}: {
  dateFrom: string;
  dateTo: string;
  fiscalYear: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onFiscalYearChange: (value: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Filtros operativos</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="giof-date-from">Desde</Label>
          <Input id="giof-date-from" type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="giof-date-to">Hasta</Label>
          <Input id="giof-date-to" type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="giof-fiscal-year">Año fiscal</Label>
          <Input id="giof-fiscal-year" inputMode="numeric" placeholder="Ej. 2026" value={fiscalYear} onChange={(event) => onFiscalYearChange(event.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCards({ data }: { data: GiofOperationsDashboard }) {
  const metrics = [
    { title: "Backlog", value: formatNumberStrict(data.summary.backlog_count), description: "Solicitudes abiertas", Icon: FileText },
    { title: "Pendientes", value: formatNumberStrict(data.summary.pending_review_count), description: "En revisión GIOF", Icon: Clock3 },
    { title: "Aprobadas sin pago", value: formatNumberStrict(data.summary.approved_pending_payment_count), description: "Requieren acción de pago", Icon: CheckCircle2 },
    { title: "Vencidas", value: formatNumberStrict(data.summary.overdue_count), description: "Fuera de plazo", Icon: AlertTriangle },
    { title: "En riesgo", value: formatNumberStrict(data.summary.in_risk_count), description: "Próximas a vencer", Icon: Users },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {metrics.map((metric) => (
        <KpiCard key={metric.title} {...metric} />
      ))}
    </div>
  );
}

function FunnelChart({ data }: { data: GiofOperationsDashboard }) {
  const chartData = data.funnel.map((item) => ({
    estado: getRequestStatusDashboardLabel(item.status),
    Solicitudes: item.count,
    Monto: item.amount,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Embudo de solicitudes</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer empty={chartData.length === 0} height={360}>
          <BarChart data={chartData} margin={{ left: 12, right: 24, top: 12, bottom: 48 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="estado" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} interval={0} angle={-25} textAnchor="end" height={72} />
            <YAxis yAxisId="left" tick={{ fill: CHART_COLORS.text }} width={44} allowDecimals={false} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: CHART_COLORS.text }} tickFormatter={(value) => formatMoneyStrict(Number(value))} width={96} />
            <DashboardTooltip />
            <DashboardLegend />
            <Bar yAxisId="left" dataKey="Solicitudes" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
            <Bar yAxisId="right" dataKey="Monto" fill={CHART_COLORS.blue} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function AgingChart({ data }: { data: GiofOperationsDashboard }) {
  const chartData = data.aging.buckets.map((bucket) => ({ bucket: bucket.label, Solicitudes: bucket.count }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Antigüedad de trámites pendientes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Promedio de antigüedad: <span className="font-medium text-foreground">{data.aging.average_days === null ? "Sin dato" : `${formatNumberStrict(data.aging.average_days)} días`}</span>
        </p>
        <ChartContainer empty={chartData.length === 0} height={300}>
          <BarChart data={chartData} margin={{ left: 12, right: 16, top: 12, bottom: 24 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="bucket" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} interval={0} height={44} />
            <YAxis tick={{ fill: CHART_COLORS.text }} width={44} allowDecimals={false} />
            <DashboardTooltip />
            <Bar dataKey="Solicitudes" fill={CHART_COLORS.amber} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function PaymentsAndRenditions({ data }: { data: GiofOperationsDashboard }) {
  const pendingTotal = data.payments.pending_count + data.payments.paid_count;
  const paidRate = pendingTotal === 0 ? null : data.payments.paid_count / pendingTotal;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Pagos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <KpiCard title="Pendientes" value={formatNumberStrict(data.payments.pending_count)} description={formatMoneyStrict(data.payments.pending_amount)} Icon={Clock3} />
          <KpiCard title="Pagados" value={formatNumberStrict(data.payments.paid_count)} description={`${formatMoneyStrict(data.payments.paid_amount)} · ${formatPercentStrict(paidRate)}`} Icon={CheckCircle2} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Rendiciones</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <span>Pendientes: <strong>{formatNumberStrict(data.renditions.pending)}</strong></span>
            <span>Vencidas: <strong>{formatNumberStrict(data.renditions.overdue)}</strong></span>
            <span>En revisión: <strong>{formatNumberStrict(data.renditions.in_review)}</strong></span>
            <span>Observadas: <strong>{formatNumberStrict(data.renditions.observed)}</strong></span>
            <span>Regularizadas: <strong>{formatNumberStrict(data.renditions.settled)}</strong></span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkloadAndExceptions({ data }: { data: GiofOperationsDashboard }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Carga por gestor</CardTitle>
        </CardHeader>
        <CardContent>
          {data.workload_by_manager.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sin datos para los filtros seleccionados</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Gestor</th>
                    <th className="py-2 pr-3 text-right font-medium">Casos</th>
                    <th className="py-2 text-right font-medium">Más antiguo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workload_by_manager.map((row) => (
                    <tr key={row.user_id ?? row.name} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 font-medium">{row.name}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatNumberStrict(row.count)}</td>
                      <td className="py-2 text-right tabular-nums">{row.oldest_days === null ? "Sin dato" : `${formatNumberStrict(row.oldest_days)} días`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Excepciones críticas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.exceptions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sin excepciones críticas para los filtros seleccionados</div>
          ) : (
            data.exceptions.map((item) => (
              <Alert key={item.type} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {getGiofExceptionLabel(item.type)}: {formatNumberStrict(item.count)} caso(s) · {formatMoneyStrict(item.amount)}
                </AlertDescription>
              </Alert>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function hasOperationalData(data: GiofOperationsDashboard): boolean {
  return (
    data.summary.backlog_count > 0 ||
    data.summary.pending_review_count > 0 ||
    data.summary.approved_pending_payment_count > 0 ||
    data.summary.overdue_count > 0 ||
    data.summary.in_risk_count > 0 ||
    data.funnel.length > 0 ||
    data.aging.buckets.some((bucket) => bucket.count > 0) ||
    data.workload_by_manager.length > 0 ||
    data.exceptions.length > 0
  );
}

export function GiofOperationsDashboardView() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fiscalYear, setFiscalYear] = useState("");
  const parsedFiscalYear = fiscalYear.trim() === "" ? undefined : Number(fiscalYear);
  const { data, isLoading, error, refetch } = useGiofOperationsDashboard({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    fiscal_year: Number.isFinite(parsedFiscalYear) ? parsedFiscalYear : undefined,
  });

  return (
    <div className="space-y-6">
      <GiofFilters
        dateFrom={dateFrom}
        dateTo={dateTo}
        fiscalYear={fiscalYear}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onFiscalYearChange={setFiscalYear}
      />
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-3">
            <span>Error al cargar el dashboard operativo: {error.message}</span>
            <Button variant="outline" size="sm" onClick={() => void refetch()} className="w-fit gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {isLoading && !data ? (
        <DashboardSkeleton />
      ) : data ? (
        <>
          {!hasOperationalData(data) && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Sin datos para los filtros seleccionados. Los ceros se muestran como valor real cuando el backend los entrega.</AlertDescription>
            </Alert>
          )}
          <SummaryCards data={data} />
          <div className="grid gap-4 xl:grid-cols-2">
            <FunnelChart data={data} />
            <AgingChart data={data} />
          </div>
          <PaymentsAndRenditions data={data} />
          <WorkloadAndExceptions data={data} />
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Sin datos para los filtros seleccionados
        </div>
      )}
    </div>
  );
}
