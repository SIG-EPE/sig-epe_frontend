import { Alert, AlertDescription } from "@/components/ui/alert";
import type { RequestRenditionAllocationCoverage, RequestRenditionReport } from "@/types/requests";

interface ClassificationItem {
  label: string;
  value: string;
}

interface SettlementBudgetClassificationProps {
  report: RequestRenditionReport | null;
  allocationLabels?: Readonly<Record<string, string>>;
  loadError?: unknown;
}

function cleanText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function joinMetadataParts(parts: Array<string | null | undefined>, separator = " / "): string | null {
  const visibleParts = parts.map(cleanText).filter((part): part is string => Boolean(part));
  return visibleParts.length > 0 ? visibleParts.join(separator) : null;
}

function formatBudgetMonth(month?: number | null): string | null {
  if (!month || month < 1 || month > 12) return null;
  return new Intl.DateTimeFormat("es-PE", { month: "long" }).format(new Date(2026, month - 1, 1));
}

export function getCoverageClassificationItems(coverage: RequestRenditionAllocationCoverage): ClassificationItem[] {
  const lineLabel = joinMetadataParts([coverage.line_code, coverage.line_name ?? coverage.resource_description], " · ");
  const periodLabel = joinMetadataParts([formatBudgetMonth(coverage.budget_month), coverage.fiscal_year ? String(coverage.fiscal_year) : null]);
  const items = [
    { label: "Clasificación / categoría", value: joinMetadataParts([coverage.classification_label, coverage.budget_category_label]) },
    { label: "Área / unidad", value: joinMetadataParts([coverage.area_label, coverage.org_unit_label]) },
    { label: "Centro de costos", value: cleanText(coverage.cost_center_label) },
    { label: "Línea / recurso", value: lineLabel },
    { label: "Programa / acción", value: joinMetadataParts([coverage.program_label, coverage.operative_action_label]) },
    { label: "Importancia / frecuencia", value: joinMetadataParts([coverage.importance_label, coverage.frequency_label]) },
    { label: "Periodo", value: periodLabel },
  ];

  return items.filter((item): item is ClassificationItem => Boolean(item.value));
}

export function hasBudgetClassification(report: RequestRenditionReport | null): boolean {
  return Boolean(report?.allocation_coverage.some((coverage) => getCoverageClassificationItems(coverage).length > 0));
}

export function SettlementBudgetClassification({ report, allocationLabels = {}, loadError }: SettlementBudgetClassificationProps) {
  const hasClassification = hasBudgetClassification(report);
  if (!hasClassification && !loadError) return null;

  return (
    <section className="space-y-3 rounded-md border p-4" data-testid="settlement-budget-classification">
      <div>
        <h3 className="text-sm font-semibold">Clasificación presupuestal</h3>
        <p className="text-xs text-muted-foreground">Datos que se incluirán en el informe generado, sin mostrar identificadores internos.</p>
      </div>
      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>No se pudo cargar la clasificación presupuestal. Intenta nuevamente.</AlertDescription>
        </Alert>
      ) : null}
      {hasClassification && report ? (
        <div className="grid gap-3 md:grid-cols-2">
          {report.allocation_coverage.map((coverage, index) => {
            const metadataItems = getCoverageClassificationItems(coverage);
            if (metadataItems.length === 0) return null;
            const allocationLabel = allocationLabels[coverage.request_allocation_id]
              ?? coverage.request_allocation_label
              ?? `Línea POA ${index + 1}`;
            return (
              <div key={coverage.request_allocation_id} className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="font-medium">{allocationLabel}</p>
                <dl className="mt-3 grid gap-2">
                  {metadataItems.map((item) => (
                    <div key={item.label} className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)]">
                      <dt className="text-xs text-muted-foreground">{item.label}</dt>
                      <dd className="font-medium">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
