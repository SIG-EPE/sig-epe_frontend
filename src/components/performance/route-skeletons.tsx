import { Skeleton } from "@/components/ui/skeleton";

function SectionHeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {action && <Skeleton className="h-10 w-44" />}
    </div>
  );
}

function FilterGridSkeleton({ items, columns = "md:grid-cols-4" }: { items: number; columns?: string }) {
  return (
    <div className={`grid gap-3 ${columns}`}>
      {Array.from({ length: items }, (_, index) => (
        <div key={index} className="space-y-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

function CardGridSkeleton({ items, columns = "sm:grid-cols-2 xl:grid-cols-4", height = "h-28" }: { items: number; columns?: string; height?: string }) {
  return (
    <div className={`grid gap-4 ${columns}`}>
      {Array.from({ length: items }, (_, index) => (
        <Skeleton key={index} className={`${height} rounded-xl`} />
      ))}
    </div>
  );
}

function ChartGridSkeleton({ items = 2, columns = "xl:grid-cols-2", height = "h-80" }: { items?: number; columns?: string; height?: string }) {
  return (
    <div className={`grid gap-4 ${columns}`}>
      {Array.from({ length: items }, (_, index) => (
        <div key={index} className="rounded-lg border bg-card p-4">
          <Skeleton className="mb-4 h-6 w-48" />
          <Skeleton className={`${height} w-full rounded-xl`} />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({ rows = 5, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="space-y-3">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div key={rowIndex} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }, (_, columnIndex) => (
              <Skeleton key={columnIndex} className="h-10 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BudgetRouteSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando dashboard presupuestal" role="status">
      <SectionHeaderSkeleton action />
      <FilterGridSkeleton items={4} columns="sm:grid-cols-2 lg:grid-cols-4" />
      <CardGridSkeleton items={4} />
      <ChartGridSkeleton items={2} columns="lg:grid-cols-2" />
      <TableSkeleton rows={4} columns={5} />
    </div>
  );
}

export function BudgetExecutionDashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando gráficos de ejecución presupuestal" role="status">
      <CardGridSkeleton items={6} columns="sm:grid-cols-2 xl:grid-cols-3" />
      <ChartGridSkeleton items={2} columns="lg:grid-cols-2" />
    </div>
  );
}

export function OrgUnitExecutionRouteSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando Programado vs Ejecutado" role="status">
      <SectionHeaderSkeleton />
      <OrgUnitExecutionDashboardSkeleton />
    </div>
  );
}

export function OrgUnitExecutionDashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando panel Programado vs Ejecutado" role="status">
      <div className="rounded-lg border bg-card p-4">
        <Skeleton className="mb-4 h-6 w-64" />
        <FilterGridSkeleton items={10} columns="md:grid-cols-4 xl:grid-cols-6" />
      </div>
      <CardGridSkeleton items={8} columns="sm:grid-cols-2 xl:grid-cols-4" />
      <ChartGridSkeleton items={2} columns="xl:grid-cols-2" height="h-96" />
      <TableSkeleton rows={6} columns={6} />
    </div>
  );
}

export function GiofDashboardRouteSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando dashboard operativo GIOF" role="status">
      <SectionHeaderSkeleton />
      <GiofDashboardPanelSkeleton />
    </div>
  );
}

export function GiofDashboardPanelSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando panel operativo GIOF" role="status">
      <div className="rounded-lg border bg-card p-4">
        <Skeleton className="mb-4 h-6 w-44" />
        <FilterGridSkeleton items={3} columns="md:grid-cols-3" />
      </div>
      <CardGridSkeleton items={5} columns="sm:grid-cols-2 xl:grid-cols-5" />
      <ChartGridSkeleton items={2} columns="xl:grid-cols-2" />
      <CardGridSkeleton items={2} columns="xl:grid-cols-2" height="h-36" />
      <ChartGridSkeleton items={2} columns="xl:grid-cols-2" height="h-64" />
    </div>
  );
}

export function PaymentQueueRouteSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando cola de pagos" role="status">
      <SectionHeaderSkeleton />
      <CardGridSkeleton items={4} columns="md:grid-cols-4" />
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Skeleton className="h-10 w-72 max-w-full" />
            <Skeleton className="h-10 w-72 max-w-full" />
          </div>
        </div>
        <TableSkeleton rows={5} columns={7} />
      </div>
    </div>
  );
}

export function RenditionsRouteSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando bandeja de rendiciones" role="status">
      <SectionHeaderSkeleton />
      <CardGridSkeleton items={6} columns="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" />
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-24" />
          </div>
          <FilterGridSkeleton items={4} columns="sm:grid-cols-2 lg:grid-cols-4" />
        </div>
        <TableSkeleton rows={5} columns={8} />
      </div>
    </div>
  );
}

export function QueueTableRowsSkeleton({ rows = 5, columns = 7 }: { rows?: number; columns?: number }) {
  return <TableSkeleton rows={rows} columns={columns} />;
}
