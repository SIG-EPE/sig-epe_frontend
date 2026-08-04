import type { PoaSourceAuthorityDetail } from '@/types/budget';

const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Setiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

const COMPLETENESS_LABEL = {
  ALL_BLANK: 'Sin datos',
  PARTIAL: 'Parcial',
  COMPLETE: 'Completa',
} as const;

function formatSourceValue(value: string | null): string {
  if (value === null) return 'Sin dato';
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
  }).format(Number(value));
}

function formatCompleteness(value: string): string {
  return COMPLETENESS_LABEL[value as keyof typeof COMPLETENESS_LABEL] ?? value;
}

export function SourceMonthGrid({
  sourceAuthority,
}: {
  sourceAuthority: PoaSourceAuthorityDetail;
}) {
  const byMonth = new Map(
    sourceAuthority.source_months.map((month) => [month.month, month]),
  );
  const coverage = sourceAuthority.statistics.coverage;

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium">Programación mensual de fuente</h2>
        <p className="text-sm text-muted-foreground">
          Cobertura: {coverage === null ? 'Sin selección' : `${(Number(coverage) * 100).toFixed(2)}%`}
          {' · '}{sourceAuthority.statistics.blankCount} sin dato
          {' · '}{sourceAuthority.statistics.explicitZeroCount} cero explícito
        </p>
      </div>
      <dl
        className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4"
        data-testid="source-statistics"
      >
        <div>
          <dt className="text-muted-foreground">Suma</dt>
          <dd className="font-medium tabular-nums">{formatSourceValue(sourceAuthority.statistics.sum)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Promedio observado</dt>
          <dd className="font-medium tabular-nums">{formatSourceValue(sourceAuthority.statistics.average)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Observados</dt>
          <dd className="font-medium tabular-nums">
            {sourceAuthority.statistics.observedCount} de {sourceAuthority.statistics.expectedCount}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Estado</dt>
          <dd className="font-medium">{formatCompleteness(sourceAuthority.statistics.completeness)}</dd>
        </div>
      </dl>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MONTHS.map((label, index) => {
          const month = byMonth.get(index + 1);
          const value = month?.value ?? null;
          return (
            <div
              className="rounded-md border px-3 py-2"
              data-testid={`source-month-${index + 1}`}
              key={label}
            >
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-medium tabular-nums">{formatSourceValue(value)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
