"use client";

import type { ReactNode } from "react";
import {
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

import { cn } from "@/lib/utils";
import { formatMoneyStrict, formatNumberStrict } from "@/lib/dashboard-formatters";

export const CHART_COLORS = {
  primary: "var(--color-chart-1)",
  redSoft: "var(--color-chart-2)",
  redDark: "var(--color-chart-3)",
  amber: "var(--color-chart-4)",
  blue: "var(--color-chart-5)",
  green: "oklch(0.50 0.12 145)",
  grid: "var(--color-border)",
  text: "var(--color-muted-foreground)",
} as const;

export type ChartValueFormat = "number" | "money";

type ChartTooltipValue = string | number | Array<string | number> | null;

interface ChartTooltipPayloadItem {
  name?: string | number;
  dataKey?: string | number;
  value?: ChartTooltipValue;
  color?: string;
}

interface ChartLegendPayloadItem {
  value?: string | number;
  color?: string;
}

interface ChartContainerProps {
  children: ReactNode;
  height?: number;
  className?: string;
  empty?: boolean;
  emptyMessage?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string | number;
  valueFormat?: ChartValueFormat;
}

function formatTooltipValue(value: ChartTooltipValue, valueFormat: ChartValueFormat): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numericValue)) {
    return "Sin dato";
  }

  return valueFormat === "money" ? formatMoneyStrict(numericValue) : formatNumberStrict(numericValue);
}

export function ChartContainer({
  children,
  height = 320,
  className,
  empty = false,
  emptyMessage = "Sin datos para los filtros seleccionados",
}: ChartContainerProps) {
  if (empty) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground",
          className,
        )}
        style={{ minHeight: height }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function ChartTooltip({ active, payload, label, valueFormat = "number" }: ChartTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-md">
      {label !== undefined && <p className="mb-1 font-medium text-popover-foreground">{String(label)}</p>}
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={`${String(item.name)}-${String(item.dataKey)}`} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color ?? CHART_COLORS.primary }}
            />
            <span className="text-muted-foreground">{String(item.name)}:</span>
            <span className="font-medium tabular-nums text-foreground">
              {item.value === null || item.value === undefined ? "Sin dato" : formatTooltipValue(item.value, valueFormat)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartLegend({ payload }: { payload?: ChartLegendPayloadItem[] }) {
  if (!payload?.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 pt-2 text-xs text-muted-foreground">
      {payload.map((entry) => (
        <span key={String(entry.value)} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.value}
        </span>
      ))}
    </div>
  );
}

export function DashboardTooltip(props: { valueFormat?: ChartValueFormat }) {
  return <Tooltip content={<ChartTooltip valueFormat={props.valueFormat} />} />;
}

export function DashboardLegend() {
  return <Legend content={<ChartLegend />} />;
}
