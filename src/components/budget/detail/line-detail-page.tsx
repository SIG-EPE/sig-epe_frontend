"use client";

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
import { useAuthStore } from "@/stores/auth-store";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(amount);
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

      {/* 2. Info grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Unidad organica</p>
          <p className="text-sm font-medium">
            {line.organizationalUnit?.name ?? line.organizational_unit?.name ?? "-"}
          </p>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Programa</p>
          <p className="text-sm font-medium">
            {line.program?.name ?? line.budget_program?.name ?? "-"}
          </p>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Categoria</p>
          <p className="text-sm font-medium">
            {line.budgetCategory?.name ?? line.budget_category?.name ?? "-"}
          </p>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Tipo</p>
          <p className="text-sm font-medium">
            {line.planning_type ?? "-"}
          </p>
        </div>

      </div>

      {/* 3. Cost */}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Costo</h2>
        <div className="flex items-baseline gap-2">
          <span className="text-muted-foreground">
            {formatCurrency(line.unit_price)} x {line.quantity}
          </span>
          <span className="text-xl font-semibold">
            = {formatCurrency(line.total_cost)}
          </span>
        </div>
      </div>

      {/* 4. Monthly table */}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Programación mensual</h2>
        <MonthlyTable
          lineId={line.id}
          totalCost={line.total_cost}
          entries={line.monthlyDistribution ?? line.monthly_distribution}
          editable={isGiof && line.status === "DRAFT"}
          lineStatus={line.status}
        />
      </div>

      {/* 5. Funding source distribution */}
      <div className="flex flex-col gap-2">
        <FundingSourceDistribution
          lineId={line.id}
          totalCost={line.total_cost}
          fiscalYearId={line.fiscal_year_id}
          status={line.status}
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
