import { CheckCircle2, CircleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRequestCurrency } from "@/lib/requests";
import type { SettlementPendingItem, SettlementPreparationTotals } from "@/lib/settlement-preparation-vm";

interface SettlementPendingPanelProps {
  items: SettlementPendingItem[];
  totals: SettlementPreparationTotals;
  disabled?: boolean;
  onGoToTask: (item: SettlementPendingItem) => void;
}

function TotalItem({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div className="min-w-0 rounded-md bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold">{formatRequestCurrency(value, currency)}</p>
    </div>
  );
}

export function SettlementPendingPanel({ items, totals, disabled = false, onGoToTask }: SettlementPendingPanelProps) {
  const pendingCount = items.length;
  const pendingLabel = `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}`;

  return (
    <aside className="md:sticky md:top-4 md:z-10" aria-label="Resumen de la rendición" data-testid="settlement-pending-panel">
      <Card className="border-primary/20 shadow-sm">
        <CardHeader className="flex-row items-start justify-between gap-3 p-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Tu avance</CardTitle>
            <p className="text-xs text-muted-foreground">Revisa qué falta antes de generar y enviar.</p>
          </div>
          <Badge variant={pendingCount > 0 ? "destructive" : "secondary"} aria-live="polite">{pendingLabel}</Badge>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0">
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
            <TotalItem label="Total del anticipo" value={totals.allocatedAmount} currency={totals.currency} />
            <TotalItem label="Total registrado" value={totals.reportedAmount} currency={totals.currency} />
            <TotalItem label="Diferencia" value={totals.differenceAmount} currency={totals.currency} />
          </div>
          {items[0] ? (
            <div className="flex gap-3 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
              <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 space-y-2">
                <p className="font-medium">Siguiente: {items[0].label}</p>
                <p>{items[0].message}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-emerald-600/30 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100">
              <CheckCircle2 className="size-5" aria-hidden="true" />
              <p>No hay pendientes en la preparación.</p>
            </div>
          )}
          {items[0] ? (
            <Button type="button" className="min-h-11 w-full whitespace-normal" disabled={disabled} onClick={() => onGoToTask(items[0])}>
              Ir al primer pendiente
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </aside>
  );
}
