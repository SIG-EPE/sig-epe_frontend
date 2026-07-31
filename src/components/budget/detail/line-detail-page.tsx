"use client";

import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/budget/planning/status-badge";
import { MonthlyTable } from "./monthly-table";
import { FundingSourceDistribution } from "./funding-source-distribution";
import { StatusTimeline } from "./status-timeline";
import { LineActions } from "./line-actions";
import { usePlanningLine } from "@/hooks/use-budget";
import { formatBusinessDateTime } from "@/lib/business-timezone";
import { PLANNING_TYPE_LABELS, PLANNING_TYPES, type PlanningType } from "@/lib/planning-types";
import { useAuthStore } from "@/stores/auth-store";
import type { FundingSourceAllocation, PlanningLine } from "@/types/budget";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(amount);
}

function formatFinancialBasis(value: number | null): string {
  return value === null ? "Sin dato" : formatCurrency(value);
}

function isPlanningType(value: string | null | undefined): value is PlanningType {
  return PLANNING_TYPES.includes(value as PlanningType);
}

function getPlanningTypeLabel(value: string | null | undefined): string {
  if (!value) return "-";
  return isPlanningType(value) ? PLANNING_TYPE_LABELS[value] : value;
}

function formatCodeName(item: { code?: string | null; name?: string | null } | null | undefined): string {
  const code = item?.code?.trim();
  const name = item?.name?.trim();
  if (code && name) return `${code} · ${name}`;
  return name ?? code ?? "-";
}

function formatOptionalDate(value: string | null | undefined): string {
  return value ? formatBusinessDateTime(value) : "-";
}

function getFundingSourceLabel(source: FundingSourceAllocation): string {
  const name = formatCodeName(source.fundingSource);
  const amount = source.allocated_amount == null ? null : formatCurrency(Number(source.allocated_amount));
  const percentage = source.percentage == null ? null : `${Number(source.percentage).toFixed(2)}%`;
  return [name, amount, percentage].filter(Boolean).join(" · ");
}

function DetailItem({ label, value }: { label: string; value: string | number | null | undefined }) {
  const displayValue = value === null || value === undefined || value === "" ? "-" : value;

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{displayValue}</p>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function getLineFundingSources(line: PlanningLine): FundingSourceAllocation[] {
  return line.fundingSources ?? line.partners ?? [];
}

export function LineDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { line, isLoading, error, refetch } = usePlanningLine(id);
  const { user } = useAuthStore();
  const isGiof =
    user?.role?.code === "GIOF" || user?.role?.code === "GIOF_GESTOR";

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-12 w-2/3" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error || !line) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-muted-foreground">
          {error ?? "Linea no encontrada"}
        </p>
        <Button variant="outline" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {line.line_code ?? "Código POA pendiente"}
              {line.fiscalYear?.year ? ` · POA ${line.fiscalYear.year}` : ""}
            </p>
            <h1 className="text-2xl font-semibold">
              {line.resource_description}
            </h1>
            <div className="flex items-center gap-2">
              <StatusBadge status={line.status} />
            </div>
          </div>
          <LineActions
            line={line}
            isGiof={isGiof}
            onRefetch={refetch}
          />
        </div>
      </div>

      <DetailSection title="Pertenencia POA">
        <DetailItem label="Código de línea" value={line.line_code} />
        <DetailItem label="Año fiscal" value={line.fiscalYear?.year} />
        <DetailItem label="Unidad orgánica" value={formatCodeName(line.organizationalUnit ?? line.organizational_unit)} />
        <DetailItem label="Tipo de planificación" value={getPlanningTypeLabel(line.planning_type)} />
        <DetailItem label="Programa / proyecto / gestión" value={formatCodeName(line.program ?? line.budget_program)} />
        <DetailItem label="Componente estratégico" value={line.operativeAction?.component?.name} />
        <DetailItem label="Acción operativa" value={line.operativeAction?.name} />
      </DetailSection>

      <DetailSection title="Clasificación y alcance">
        <DetailItem label="Recurso" value={line.resource_description} />
        <DetailItem label="Categoría / tipo de recurso" value={formatCodeName(line.budgetCategory ?? line.budget_category)} />
        <DetailItem label="Territorio" value={formatCodeName(line.territory)} />
        <DetailItem label="Importancia" value={line.importance} />
        <DetailItem label="Frecuencia" value={line.frequency} />
        <DetailItem label="Estado actual" value={line.status} />
      </DetailSection>

      {/* 3. Cost */}
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <h2 className="text-lg font-medium">Costo</h2>
        <div className="flex items-baseline gap-2">
          <span className="text-muted-foreground">
            {formatFinancialBasis(line.unit_price)} x {line.quantity ?? "Sin dato"}
          </span>
          <span className="text-xl font-semibold">
            = {formatCurrency(line.total_cost)}
          </span>
        </div>
      </div>

      <DetailSection title="Financiamiento y registro">
        <DetailItem
          label="Fuentes de financiamiento"
          value={getLineFundingSources(line).length > 0 ? getLineFundingSources(line).map(getFundingSourceLabel).join(" | ") : "Sin fuentes asignadas"}
        />
        <DetailItem label="Creada" value={formatOptionalDate(line.created_at)} />
        <DetailItem label="Enviada" value={formatOptionalDate(line.submitted_at)} />
        <DetailItem label="Aprobada" value={formatOptionalDate(line.approved_at)} />
      </DetailSection>

      {/* 4. Monthly table */}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Programación mensual</h2>
        <MonthlyTable
          lineId={line.id}
          totalCost={line.total_cost}
          entries={line.monthlyDistribution ?? line.monthly_distribution}
          editable={isGiof && line.status === "DRAFT"}
          lineStatus={line.status}
          onConflictRefetch={refetch}
        />
      </div>

      {/* 5. Funding source distribution */}
      <div className="flex flex-col gap-2">
        <FundingSourceDistribution
          lineId={line.id}
          totalCost={line.total_cost}
          fiscalYearId={line.fiscal_year_id}
          status={line.status}
          onConflictRefetch={refetch}
        />
      </div>

      {/* 6. Status timeline */}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Estado</h2>
        <StatusTimeline
          status={line.status}
          submittedAt={line.submitted_at ?? undefined}
          approvedAt={line.approved_at ?? undefined}
          approvedBy={line.approved_by ?? undefined}
          rejectionReason={line.rejection_reason ?? undefined}
        />
      </div>

      {/* Rejection alert */}
      {line.status === "REJECTED" && line.rejection_reason && (
        <Alert variant="destructive">
          <AlertDescription>
            <strong>Rechazada:</strong> {line.rejection_reason}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
