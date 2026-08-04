"use client";

// -------------------------------------------------------
// BalanceCards — Metric cards for budget dashboard
// Shows: Planificado, Comprometido, Ejecutado, Disponible
// -------------------------------------------------------

import { BarChart3, CreditCard, DollarSign, Wallet } from "lucide-react";
import type { ComponentType } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BalanceData } from "@/types/budget";

// -------------------------------------------------------
// Formateador de moneda peruana — seguro contra NaN/undefined
// -------------------------------------------------------

const PEN_FORMAT = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});

function formatCurrency(value: number | string | undefined | null): string {
  const num = Number(value);
  if (isNaN(num)) return "S/ 0.00";
  return PEN_FORMAT.format(num);
}

// -------------------------------------------------------
// Configuraciones por tarjeta — paleta unificada con la app
// Usa variables del tema (primary = rojo granate #7f1d1d aprox)
// -------------------------------------------------------

interface MetricConfig {
  label: string;
  valueKey: keyof Pick<BalanceData, "monthly_programmed_decimal" | "total_committed" | "total_executed" | "available">;
  Icon: ComponentType<{ className?: string }>;
  isNegativeWarning?: boolean;
}

const METRICS: MetricConfig[] = [
  {
    label: "Programado mensual",
    valueKey: "monthly_programmed_decimal",
    Icon: BarChart3,
  },
  {
    label: "Costo generado",
    valueKey: "total_committed",
    Icon: CreditCard,
  },
  {
    label: "Ejecutado",
    valueKey: "total_executed",
    Icon: DollarSign,
  },
  {
    label: "Disponible",
    valueKey: "available",
    Icon: Wallet,
    isNegativeWarning: true,
  },
];

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface BalanceCardsProps {
  data: BalanceData;
}

// -------------------------------------------------------
// Componente
// -------------------------------------------------------

export function BalanceCards({ data }: BalanceCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {METRICS.map(({ label, valueKey, Icon, isNegativeWarning }) => {
        const raw = valueKey === "monthly_programmed_decimal"
          ? data.monthly_programmed_decimal ?? data.total_planned
          : data[valueKey];
        const value = Number(raw);
        const isNegative = isNegativeWarning && !isNaN(value) && value < 0;

        return (
          <Card key={valueKey} className="border border-border bg-card">
            <CardContent className="flex flex-row items-center gap-4 p-5">
              {/* Icono con fondo del color primario de la app */}
              <div className="flex shrink-0 items-center justify-center rounded-lg bg-accent p-2.5">
                <Icon className="h-5 w-5 text-accent-foreground" />
              </div>

              {/* Contenido */}
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </span>
                <span
                  className={cn(
                    "text-xl font-bold tabular-nums text-foreground",
                    isNegative && "text-destructive"
                  )}
                >
                  {formatCurrency(raw)}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
