"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { toast } from "sonner";
import { Save, Loader2, ChevronRight, ChevronDown, Plus } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBusinessDate } from "@/lib/business-timezone";
import { ROUTES } from "@/lib/constants";
import { useUpsertMonthly, useManualExecutions } from "@/hooks/use-budget";
import { useAuthStore } from "@/stores/auth-store";
import { MONTHLY_EXECUTION_DETAIL_SOURCE, type MonthlyEntry, type MonthlyExecutionDetail } from "@/types/budget";
import { ManualExecutionModal } from "./manual-execution-modal";

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
];

interface MonthlyTableProps {
  lineId?: string;
  totalCost?: number;
  entries?: MonthlyEntry[];
  editable?: boolean;
  lineStatus?: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(amount);
}

function formatExecutionDate(value?: string | null): string {
  return formatBusinessDate(value, { dateStyle: "short" }).replace("—", "Sin fecha");
}

function getExecutionDetailLabel(detail: MonthlyExecutionDetail): string {
  if (detail.source === MONTHLY_EXECUTION_DETAIL_SOURCE.PAYMENT_REQUEST) {
    return detail.requestCode ? `Solicitud ${detail.requestCode}` : "Solicitud pagada";
  }

  return "Ejecución manual";
}

function getRequestDetailHref(detail: MonthlyExecutionDetail): Route | null {
  if (
    detail.source !== MONTHLY_EXECUTION_DETAIL_SOURCE.PAYMENT_REQUEST ||
    !detail.requestId
  ) {
    return null;
  }

  return `${ROUTES.REQUESTS}/${detail.requestId}` as Route;
}

export function MonthlyTable({
  lineId,
  totalCost,
  entries = [],
  editable = false,
  lineStatus,
}: MonthlyTableProps) {
  // Estado local para los 12 valores de planned_amount
  const [plannedAmounts, setPlannedAmounts] = useState<Record<number, number>>(() => {
    const initial: Record<number, number> = {};
    for (let m = 1; m <= 12; m++) {
      const entry = entries.find((e) => e.month === m);
      initial[m] = Number(entry?.planned_amount ?? 0);
    }
    return initial;
  });

  // Expand/collapse por mes
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(new Set());
  // Modal de ejecución manual
  const [showManualModal, setShowManualModal] = useState(false);
  const [modalMonth, setModalMonth] = useState<number | null>(null);

  const { upsert, isLoading: isSaving } = useUpsertMonthly();
  const { data: manualExecutions, refetch: refetchManualExecutions } = useManualExecutions(lineId ?? "");
  const { user } = useAuthStore();
  const isGiofGestor = user?.role?.code === "GIOF_GESTOR" || user?.role?.code === "GIOF";

  const totalPlanned = Object.values(plannedAmounts).reduce((s, v) => s + Number(v), 0);
  const totalExecuted = entries.reduce((s, e) => {
    const manualSum = manualExecutions
      .filter((m) => m.month === e.month)
      .reduce((acc, m) => acc + Number(m.amount), 0);
    return s + Number(e.executed_amount) + manualSum;
  }, 0);
  const totalBalance = totalPlanned - totalExecuted;

  const exceedsTotal = totalCost !== undefined && totalPlanned > totalCost;

  function toggleExpand(month: number) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) {
        next.delete(month);
      } else {
        next.add(month);
      }
      return next;
    });
  }

  function handlePlannedChange(month: number, value: string) {
    const num = parseFloat(value) || 0;
    setPlannedAmounts((prev) => ({ ...prev, [month]: num }));
  }

  const handleSave = async () => {
    if (!lineId) return;
    try {
      await upsert(lineId, {
        distribution: Object.entries(plannedAmounts).map(([month, planned_amount]) => ({
          month: Number(month),
          planned_amount,
        })),
      });
      toast.success("Programación mensual guardada correctamente");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al guardar programación";
      toast.error(message);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>Mes</TableHead>
            <TableHead className="text-right">Programado</TableHead>
            <TableHead className="text-right">Ejecutado</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MONTHS_ES.map((name, index) => {
            const month = index + 1;
            const planned = plannedAmounts[month] ?? 0;
            const entry = entries.find((e) => e.month === month);
            const apiExecuted = Number(entry?.executed_amount ?? 0);
            const manualSum = manualExecutions
              .filter((me) => me.month === month)
              .reduce((acc, me) => acc + Number(me.amount), 0);
            const executed = apiExecuted + manualSum;
            const balance = planned - executed;
            const isExpanded = expandedMonths.has(month);
            const canAddExecution = lineStatus === "APPROVED" && isGiofGestor && !!lineId;
            const paidExecutionDetails = entry?.execution_details ?? [];
            const manualExecutionDetails: MonthlyExecutionDetail[] = manualExecutions
              .filter((me) => me.month === month)
              .map((me) => ({
                id: me.id,
                source: MONTHLY_EXECUTION_DETAIL_SOURCE.MANUAL,
                concept: me.concept,
                amount: Number(me.amount),
                paidAt: me.execution_date,
                createdAt: me.created_at,
                status: "MANUAL",
                type: "MANUAL",
              }));
            const executionDetails = [...paidExecutionDetails, ...manualExecutionDetails];
            return (
              <Fragment key={month}>
                <TableRow
                  key={month}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => toggleExpand(month)}
                >
                  <TableCell className="w-8 pr-0">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>{name}</TableCell>
                  <TableCell className="text-right">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className="w-32 rounded border border-input bg-transparent px-2 py-1 text-right text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        value={plannedAmounts[month] ?? 0}
                        onChange={(e) => {
                          e.stopPropagation();
                          handlePlannedChange(month, e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="font-mono">{formatCurrency(planned)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {formatCurrency(executed)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      balance < 0 ? "text-destructive" : undefined,
                    )}
                  >
                    {formatCurrency(balance)}
                  </TableCell>
                </TableRow>

                {/* Sub-fila expandida */}
                {isExpanded && (
                  <TableRow key={`${month}-expanded`} className="bg-muted/20">
                    <TableCell />
                    <TableCell colSpan={4} className="py-3">
                      <div className="flex flex-col gap-2 pl-2">
                        {/* Desglose de ejecuciones */}
                        {executionDetails.length > 0 && (
                          <div className="text-sm text-muted-foreground">
                            <p className="mb-1 font-medium">Detalle de ejecuciones:</p>
                            <div className="flex flex-col gap-1">
                              {executionDetails.map((detail) => {
                                const requestHref = getRequestDetailHref(detail);
                                const detailLabel = getExecutionDetailLabel(detail);

                                return (
                                  <div key={`${detail.source}-${detail.id}`} className="grid gap-1 rounded-md border bg-background/60 p-2 text-xs md:grid-cols-[minmax(0,1fr)_auto]">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        {requestHref ? (
                                          <Link
                                            href={requestHref}
                                            className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            aria-label={`Ver ${detailLabel}`}
                                          >
                                            {detailLabel}
                                          </Link>
                                        ) : (
                                          <span className="font-medium text-foreground">{detailLabel}</span>
                                        )}
                                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                          {detail.source === MONTHLY_EXECUTION_DETAIL_SOURCE.PAYMENT_REQUEST ? "Solicitud pagada" : "Manual"}
                                        </span>
                                        {detail.status && <span className="text-muted-foreground">{detail.status}</span>}
                                      </div>
                                      <p className="truncate text-muted-foreground">{detail.concept}</p>
                                      <p className="text-muted-foreground">
                                        Fecha: {formatExecutionDate(detail.paidAt ?? detail.createdAt)}
                                        {detail.type ? ` · Tipo: ${detail.type}` : ""}
                                      </p>
                                    </div>
                                    <span className="font-mono font-medium text-foreground md:text-right">{formatCurrency(detail.amount)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Botón para agregar ejecución manual */}
                        {canAddExecution && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-fit text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalMonth(month);
                              setShowManualModal(true);
                            }}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            Registrar ejecución manual
                          </Button>
                        )}

                        {!canAddExecution && executionDetails.length === 0 && (
                          <p className="text-xs italic text-muted-foreground">Sin ejecuciones en este mes</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="font-semibold">
            <TableCell />
            <TableCell>Total</TableCell>
            <TableCell
              className={cn(
                "text-right font-mono",
                exceedsTotal ? "text-destructive" : undefined,
              )}
            >
              {formatCurrency(totalPlanned)}
              {exceedsTotal && (
                <span className="ml-2 text-xs font-normal">
                  (excede costo total {formatCurrency(totalCost!)})
                </span>
              )}
            </TableCell>
            <TableCell className="text-right font-mono">
              {formatCurrency(totalExecuted)}
            </TableCell>
            <TableCell
              className={cn(
                "text-right font-mono",
                totalBalance < 0 ? "text-destructive" : undefined,
              )}
            >
              {formatCurrency(totalBalance)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      {/* Botón de guardar — solo si es editable y tiene lineId */}
      {editable && lineId && (
        <div className="flex items-center justify-between">
          {totalCost !== undefined && (
            <p
              className={cn(
                "text-sm",
                exceedsTotal
                  ? "text-destructive"
                  : totalPlanned === 0
                  ? "text-muted-foreground"
                  : "text-green-700",
              )}
            >
              {exceedsTotal
                ? `La programación (${formatCurrency(totalPlanned)}) excede el costo total de la línea (${formatCurrency(totalCost)})`
                : totalPlanned === 0
                ? "Ingrese los montos programados por mes"
                : `Te queda: ${formatCurrency((totalCost ?? 0) - totalPlanned)} de ${formatCurrency(totalCost)}`}
            </p>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || exceedsTotal}
            className="ml-auto"
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Guardar programación
          </Button>
        </div>
      )}

      {/* Modal de ejecución manual */}
      {showManualModal && lineId && (
        <ManualExecutionModal
          lineId={lineId}
          initialMonth={modalMonth}
          open={showManualModal}
          onClose={() => {
            setShowManualModal(false);
            setModalMonth(null);
          }}
          onSuccess={() => {
            setShowManualModal(false);
            setModalMonth(null);
            void refetchManualExecutions();
          }}
        />
      )}
    </div>
  );
}
