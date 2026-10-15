"use client";

import { useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/budget/planning/status-badge";
import { MonthlyTable } from "./monthly-table";
import { ManualExecutionModal } from "./manual-execution-modal";
import { DraftCostModal } from "./draft-cost-modal";
import { PlanningHierarchyEditor } from "./planning-hierarchy-editor";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApprovedAmendmentModal, ApprovedAmendmentWarnings } from "./approved-amendment-modal";
import type { ApprovedAmendmentWarning } from "@/hooks/use-approved-amendment";
import { SourceMonthGrid } from "./source-month-grid";
import { FundingSourceDistribution } from "./funding-source-distribution";
import { StatusTimeline } from "./status-timeline";
import { PlanningLineTerritoryCard } from "./planning-line-territory-card";
import { LineActions } from "./line-actions";
import { usePlanningLine } from "@/hooks/use-budget";
import { formatBusinessDateTime } from "@/lib/business-timezone";
import { PLANNING_TYPE_LABELS, PLANNING_TYPES, type PlanningType } from "@/lib/planning-types";
import { useAuthStore } from "@/stores/auth-store";
import type { FundingSourceAllocation, PlanningLine } from "@/types/budget";
import {
  getPoaTerritorySelectionFeatures,
  resolvePoaTerritorySelectionRead,
} from "@/config/poa-territory-selection";
import { isUnclassifiedLabel } from "@/lib/poa-territory-selection";
import { ROLE_CAPABILITY, hasRoleCapability } from "@/lib/role-capabilities";
import { ROLE_CODE } from "@/lib/constants";
import { api } from "@/lib/api-client";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(amount);
}

function formatFinancialBasis(value: number | string | null): string {
  return value === null
    ? "Sin dato"
    : typeof value === "string"
      ? `S/ ${value}`
      : formatCurrency(value);
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

interface SavedAmendmentWarnings {
  line: PlanningLine;
  warnings: ApprovedAmendmentWarning[];
}

function CompactFinancialWarnings({ warnings }: { warnings: ApprovedAmendmentWarning[] }) {
  if (!warnings.length) return null;
  const groups = new Map<string, ApprovedAmendmentWarning[]>();
  const other: ApprovedAmendmentWarning[] = [];
  for (const warning of warnings) {
    const isUnknown = warning.code === "UNKNOWN_VALUATION";
    const isCeiling = warning.scope === "UNIT_YEAR" &&
      (warning.code === "CEILING_EXCEEDED" || warning.code === "HISTORICAL_OVERRUN");
    if (!isUnknown && !isCeiling) {
      other.push(warning);
      continue;
    }
    // Solo esta línea/UO: no mezclar años, estados ni causas del techo con meses.
    const scope = isUnknown && (warning.scope === "MONTH" || warning.scope === "TOTAL")
      ? "LINE_VALUATION" : warning.scope;
    const key = `${isUnknown ? "UNKNOWN" : "CEILING"}-${scope}-${warning.fiscalYear ?? "unspecified"}-${warning.status}`;
    const group = groups.get(key) ?? [];
    group.push(warning);
    groups.set(key, group);
  }
  return (
    <Alert role="region" aria-label="Avisos financieros (informativos)">
      <AlertDescription>
        <strong>Avisos financieros (informativos)</strong>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {Array.from(groups, ([key, group]) => {
            const warning = group[0];
            const year = warning.fiscalYear === undefined ? "" : ` para ${warning.fiscalYear}`;
            const hasMonths = group.some((item) => item.scope === "MONTH");
            const hasTotal = group.some((item) => item.scope === "TOTAL");
            const valuationScope = [hasMonths ? "programación mensual" : "", hasTotal ? "total" : ""].filter(Boolean).join(" y ");
            return (
              <li key={key}>
                {warning.code === "UNKNOWN_VALUATION" ? (
                  <><strong>Valoración incompleta</strong>: {warning.scope === "UNIT_YEAR"
                    ? `Faltan datos para comprobar el techo anual de la unidad${year}.`
                    : `Hay datos pendientes de valoración en PEN${year}${valuationScope ? ` (${valuationScope})` : ""}.`} No equivale a un importe cero.</>
                ) : (
                  <><strong>Techo UO excedido</strong>: Techo presupuestario de la unidad superado{year}.</>
                )}
              </li>
            );
          })}
          {other.length > 0 && <li>Hay otras advertencias financieras</li>}
        </ul>
        <details className="mt-3">
          <summary className="cursor-pointer rounded-sm text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ver detalle</summary>
          <div className="mt-2">
            <ApprovedAmendmentWarnings warnings={warnings} />
            <p className="mt-2 break-words text-xs">Códigos del servidor: {Array.from(new Set(warnings.map((warning) => warning.code))).join(", ")}</p>
          </div>
        </details>
      </AlertDescription>
    </Alert>
  );
}

export function LineDetailPage() {
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualMonth, setManualMonth] = useState<number | null>(null);
  const [executionRefresh, setExecutionRefresh] = useState(0);
  const [amendmentOpen, setAmendmentOpen] = useState(false);
  const [draftCostOpen, setDraftCostOpen] = useState(false);
  const [draftHierarchyOpen, setDraftHierarchyOpen] = useState(false);
  const [savedAmendmentWarnings, setSavedAmendmentWarnings] = useState<SavedAmendmentWarnings | null>(null);
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const sourceMonthsEnabled =
    process.env.NEXT_PUBLIC_POA_SOURCE_MONTHS_ENABLED === "true";
  const { line, isLoading, error, refetch, applyApprovedLine } = usePlanningLine(id, {
    measureAuthority: sourceMonthsEnabled ? "source" : "operational",
  });
  const { user } = useAuthStore();
  const isGiof = hasRoleCapability(user?.role?.code, ROLE_CAPABILITY.BUDGET_ADMIN);
  const canRecordExecution =
    user?.role?.code === ROLE_CODE.GIOF_MANAGER && line?.status === "APPROVED";
  const canAmendApproved = canRecordExecution;
  const canEditDraftCost = line?.status === "DRAFT" && (
    user?.role?.code === ROLE_CODE.GIOF_GESTOR ||
    user?.role?.code === ROLE_CODE.GIOF_MANAGER ||
    user?.role?.code === ROLE_CODE.ADMIN_SISTEMA ||
    (user?.role?.code === ROLE_CODE.SOLICITANTE_EPE && line.created_by === user.id)
  );

  function openManualExecution(month: number | null) {
    setManualMonth(month);
    setManualModalOpen(true);
  }

  if (isLoading && !line) {
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

  const territoryFeatures = getPoaTerritorySelectionFeatures();
  // POST cubre el intervalo hasta el nuevo GET. [] vigente sí resuelve alertas;
  // un API antiguo sin el campo no prueba que se hayan resuelto.
  const savedWarnings = savedAmendmentWarnings?.line.id === line.id ? savedAmendmentWarnings : null;
  const amendmentWarnings = savedWarnings?.line === line
    ? savedWarnings.warnings
    : line.approved_amendment_warnings ?? savedWarnings?.warnings ?? [];
  const territoryRead = resolvePoaTerritorySelectionRead(
    line.territory_selection,
    line.territory ?? null,
  );
  const legacyTerritoryLabel = formatCodeName(line.territory);
  const categoryLabel = formatCodeName(line.budgetCategory ?? line.budget_category);
  const isUnclassified = territoryFeatures.readEnabled && (
    isUnclassifiedLabel(categoryLabel)
      || getLineFundingSources(line).some((source) => isUnclassifiedLabel(formatCodeName(source.fundingSource)))
  );

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
            roleCode={user?.role?.code}
            onRefetch={refetch}
            onApproved={applyApprovedLine}
          />
        </div>
        {canAmendApproved && <Button type="button" className="w-full sm:w-auto sm:self-start" variant="outline" onClick={() => setAmendmentOpen(true)}>Editar presupuesto aprobado</Button>}
        <CompactFinancialWarnings warnings={amendmentWarnings} />
        {canRecordExecution && (
          <div className="flex flex-col items-start gap-2">
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => openManualExecution(null)}
            >
              Registrar ejecución directa del POA
            </Button>
            <p className="text-sm text-muted-foreground">
              Ejecución presupuestal sin solicitud; no genera pago bancario ni
              constancia
            </p>
          </div>
        )}
      </div>

      <DetailSection title="Pertenencia POA">
        <DetailItem label="Código de línea" value={line.line_code} />
        <DetailItem label="Año fiscal" value={line.fiscalYear?.year} />
        <DetailItem label="Unidad orgánica" value={formatCodeName(line.organizationalUnit ?? line.organizational_unit)} />
        <DetailItem label="Tipo de planificación" value={getPlanningTypeLabel(line.planning_type)} />
        <DetailItem label="Programa / proyecto / gestión" value={formatCodeName(line.program ?? line.budget_program)} />
        <DetailItem label="Componente estratégico" value={line.poaHierarchy?.component?.name ?? line.operativeAction?.component?.name} />
        <DetailItem label="Acción operativa" value={line.poaHierarchy?.action?.name ?? line.operativeAction?.name} />
      </DetailSection>
      {canEditDraftCost && <Button type="button" variant="outline" className="w-full sm:w-auto sm:self-start" onClick={() => setDraftHierarchyOpen(true)}>Editar jerarquía</Button>}

      <DetailSection title="Clasificación y alcance">
        <DetailItem label="Recurso" value={line.resource_description} />
        <DetailItem label="Categoría / tipo de recurso" value={categoryLabel} />
        {territoryRead.source === "LEGACY_ANCHOR" && (
          <DetailItem label="Territorio" value={legacyTerritoryLabel} />
        )}
        <DetailItem label="Importancia" value={line.importance} />
        <DetailItem label="Frecuencia" value={line.frequency} />
        <DetailItem label="Estado actual" value={line.status} />
      </DetailSection>

      {territoryRead.source === "STRUCTURED" && (
        <PlanningLineTerritoryCard
          lineId={line.id}
          selection={territoryRead.value}
          legacyLabel={legacyTerritoryLabel}
          canEdit={territoryFeatures.writeEnabled && line.status === "DRAFT" && (isGiof || line.created_by === user?.id)}
          onUpdated={refetch}
        />
      )}

      {isUnclassified && (
        <Alert>
          <AlertDescription>
            <strong>POR CLASIFICAR:</strong> esta línea conserva una clasificación temporal. Revisa la categoría y las fuentes de financiamiento antes de enviarla.
          </AlertDescription>
        </Alert>
      )}

      {/* 3. Cost */}
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Costo</h2>
          {canEditDraftCost && <Button type="button" variant="outline" size="sm" onClick={() => setDraftCostOpen(true)}>Editar costo</Button>}
        </div>
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
          onExecutionCreated={refetch}
          onOpenManualExecution={canRecordExecution ? openManualExecution : undefined}
          executionRefresh={executionRefresh}
        />
      </div>

      {canEditDraftCost && draftCostOpen && <DraftCostModal line={line} onClose={() => setDraftCostOpen(false)} onSuccess={async () => {
        setDraftCostOpen(false);
        await refetch();
      }} />}
      {canEditDraftCost && draftHierarchyOpen && <Dialog open onOpenChange={(open) => { if (!open) setDraftHierarchyOpen(false); }}><DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Editar jerarquía del borrador</DialogTitle><DialogDescription>Modifica únicamente la clasificación actual de esta línea POA.</DialogDescription></DialogHeader><PlanningHierarchyEditor line={line} onCatalogRenamed={async () => { try { applyApprovedLine(await api.get<PlanningLine>(`/budget/planning-lines/${line.id}`)); } catch { toast.error("El nombre cambió, pero no se pudo actualizar el detalle. Recarga al cerrar."); } }} onSaved={async () => { setDraftHierarchyOpen(false); await refetch(); }} /></DialogContent></Dialog>}

      {canRecordExecution && manualModalOpen && (
        <ManualExecutionModal
          lineId={line.id}
          initialMonth={manualMonth}
          open={manualModalOpen}
          onClose={() => setManualModalOpen(false)}
          onSuccess={() => {
            setManualModalOpen(false);
            setExecutionRefresh((previous) => previous + 1);
            void refetch();
          }}
        />
      )}
      {canAmendApproved && amendmentOpen && <ApprovedAmendmentModal line={line} onCatalogRenamed={applyApprovedLine} onClose={() => setAmendmentOpen(false)} onSuccess={(warnings) => {
        setSavedAmendmentWarnings({ line, warnings });
        setAmendmentOpen(false);
        void refetch();
      }} />}

      {line.source_authority && (
        <SourceMonthGrid sourceAuthority={line.source_authority} />
      )}

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
