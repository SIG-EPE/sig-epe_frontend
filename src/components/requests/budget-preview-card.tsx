import { AlertTriangle, ShieldAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRequestCurrency, isBudgetPreviewBlocking, sanitizeBudgetMessage } from "@/lib/requests";
import type { RequestBudgetPreview } from "@/types/requests";

interface BudgetPreviewCardProps {
  preview: RequestBudgetPreview | null;
  isLoading: boolean;
  error: Error | null;
  canPreview: boolean;
  onRetry: () => void;
}

export function BudgetPreviewCard({ preview, isLoading, error, canPreview, onRetry }: BudgetPreviewCardProps) {
  if (!canPreview) {
    return <p className="rounded-md border p-4 text-sm text-muted-foreground">Selecciona línea POA, mes y monto válido para calcular la vista previa presupuestal.</p>;
  }

  if (isLoading) {
    return <p className="rounded-md border p-4 text-sm text-muted-foreground">Calculando vista previa presupuestal...</p>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <h3 className="font-medium">No se pudo calcular el presupuesto</h3>
        <AlertDescription className="space-y-2">
          <p>{error.message}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>Reintentar</Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!preview) return null;

  const blocking = isBudgetPreviewBlocking(preview);

  return (
    <Card className={blocking ? "border-destructive" : undefined}>
      <CardHeader>
        <CardTitle className="text-base">Vista previa presupuestal</CardTitle>
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
