import { AlertTriangle, ShieldAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRequestCurrency, isBudgetPreviewBlocking, sanitizeBudgetMessage } from "@/lib/requests";
import type { RequestAllocationsBudgetPreview, RequestBudgetPreview } from "@/types/requests";

interface BudgetPreviewCardProps {
  preview: RequestBudgetPreview | RequestAllocationsBudgetPreview | null;
  isLoading: boolean;
  error: Error | null;
  canPreview: boolean;
  onRetry: () => void;
}

export function BudgetPreviewCard({ preview, isLoading, error, canPreview, onRetry }: BudgetPreviewCardProps) {
  if (!canPreview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen presupuestal</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Agrega una o más líneas POA con monto para calcular la validación presupuestal.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return <p className="rounded-md border p-4 text-sm text-muted-foreground">Calculando validación presupuestal...</p>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <h3 className="font-medium">No se pudo calcular la validación presupuestal</h3>
        <AlertDescription className="space-y-2">
          <p>{error.message}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>Reintentar</Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!preview) return null;

  if ("allocations" in preview) {
    const blocking = preview.hard_blocked;

    return (
      <Card className={blocking ? "border-destructive" : undefined}>
        <CardHeader>
          <CardTitle className="text-base">Resumen presupuestal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Validación agregada de la solicitud según las líneas POA y montos asignados.</p>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Líneas POA</p>
              <p className="font-semibold">{preview.allocation_count}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total solicitado</p>
              <p className="font-semibold">{formatRequestCurrency(preview.total_requested_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Año fiscal</p>
              <p className="font-semibold">{preview.fiscal_year ?? "—"}</p>
            </div>
          </div>

          <div className="space-y-2">
            {preview.allocations.map((allocation, index) => (
              <div key={`${allocation.budget_planning_line_id}-${index}`} className="rounded-md border p-3 text-sm">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">Línea POA {index + 1}</p>
                    <p className="text-xs text-muted-foreground">Estado: {allocation.hard_blocked ? "Bloqueada" : allocation.valid ? "Validada" : "Con observaciones"}</p>
                  </div>
                  <p className="font-semibold">{formatRequestCurrency(allocation.amount)}</p>
                </div>
                <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <span>Restante línea/mes: {allocation.line_planned_remaining === undefined || allocation.line_planned_remaining === null ? "—" : formatRequestCurrency(allocation.line_planned_remaining)}</span>
                  <span>Techo restante unidad: {allocation.remaining_ceiling === undefined || allocation.remaining_ceiling === null ? "Sin techo" : formatRequestCurrency(allocation.remaining_ceiling)}</span>
                  <span>{allocation.hard_blocked ? "Bloquea el envío" : "No bloquea el envío"}</span>
                </div>
                {allocation.errors.length > 0 && <p className="mt-2 text-xs text-destructive">{allocation.errors.map(sanitizeBudgetMessage).join(" ")}</p>}
                {allocation.lineWarning && <p className="mt-2 text-xs text-muted-foreground">{allocation.lineWarningMessage ? sanitizeBudgetMessage(allocation.lineWarningMessage) : null}</p>}
                {allocation.warnings.map((warning) => (
                  <p key={warning} className="mt-2 text-xs text-muted-foreground">{sanitizeBudgetMessage(warning)}</p>
                ))}
              </div>
            ))}
          </div>

          {blocking && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <h3 className="font-medium">Bloquea el envío</h3>
              <AlertDescription>{preview.errors.map(sanitizeBudgetMessage).join(" ")}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  const blocking = isBudgetPreviewBlocking(preview);

  return (
    <Card className={blocking ? "border-destructive" : undefined}>
      <CardHeader>
        <CardTitle className="text-base">Validación presupuestal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Planificado línea/mes</p>
            <p className="font-semibold">{preview.planned_line_month_amount === null ? "—" : formatRequestCurrency(preview.planned_line_month_amount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Restante línea/mes</p>
            <p className="font-semibold">{preview.line_planned_remaining === null ? "—" : formatRequestCurrency(preview.line_planned_remaining)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Techo restante unidad</p>
            <p className="font-semibold">{preview.remaining_ceiling === null ? "Sin techo" : formatRequestCurrency(preview.remaining_ceiling)}</p>
          </div>
        </div>

        {preview.month === null && (
          <p className="text-sm text-muted-foreground">El mes presupuestal se definirá con la fecha de pago. Antes del pago, esta vista previa solo evalúa el techo disponible de la unidad orgánica.</p>
        )}

        {preview.lineWarning && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <h3 className="font-medium">Advertencia de línea/mes</h3>
            <AlertDescription>{preview.lineWarningMessage ? sanitizeBudgetMessage(preview.lineWarningMessage) : null}</AlertDescription>
          </Alert>
        )}

        {blocking && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <h3 className="font-medium">Bloquea el envío</h3>
            <AlertDescription>{preview.orgUnitBlockingErrors.map(sanitizeBudgetMessage).join(" ")}</AlertDescription>
          </Alert>
        )}

        {preview.warnings.map((warning) => (
          <p key={warning} className="text-sm text-muted-foreground">{sanitizeBudgetMessage(warning)}</p>
        ))}
      </CardContent>
    </Card>
  );
}
