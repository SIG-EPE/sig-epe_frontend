"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Trash2, Users, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useLineFundingSources,
  useFundingSourceAllocations,
  useSuggestFundingSources,
  useAddLineFundingSource,
  useRemoveLineFundingSource,
  type LineFundingSource,
  type FundingSourceSuggestion,
} from "@/hooks/use-budget";
import { cn } from "@/lib/utils";

// ─── Helpers ────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(amount);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

// ─── Types ────────────────────────────────────────────────

interface FundingSourceDistributionProps {
  lineId: string;
  totalCost: number;
  fiscalYearId: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
}

type Step = "list" | "select" | "distribute";

interface DistributionRow {
  fundingSourceId: string;
  fundingSourceName: string;
  suggestedAmount: number;
  availableBalance: number;
  assignedAmount: number;
}

// ─── Componente principal ─────────────────────────────────

export function FundingSourceDistribution({
  lineId,
  totalCost,
  fiscalYearId,
  status,
}: FundingSourceDistributionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [step, setStep] = useState<Step>("list");

  // Estado paso 1 — selección
  const [totalAmount, setTotalAmount] = useState(totalCost);
  const [selectedFundingSourceIds, setSelectedFundingSourceIds] = useState<Set<string>>(new Set());

  // Estado paso 2 — distribución editable
  const [distributionRows, setDistributionRows] = useState<DistributionRow[]>([]);

  // Fuentes ya asignadas a esta línea
  const { data: lineFundingSources, isLoading: loadingFundingSources, refetch: refetchFundingSources } =
    useLineFundingSources(lineId);

  // Aportes registrados del año fiscal (todas las fuentes disponibles)
  const { data: allocations, isLoading: loadingAllocations } =
    useFundingSourceAllocations(fiscalYearId);

  const { suggest, isLoading: isSuggesting } = useSuggestFundingSources();
  const { add, isLoading: isAdding } = useAddLineFundingSource();
  const { remove, isLoading: isRemoving } = useRemoveLineFundingSource();

  const isDraft = status === "DRAFT";

  // ─── Calcular saldo disponible de cada fuente ─────────────

  const fundingSourceBalances = useMemo(() => {
    if (!allocations) return new Map<string, { name: string; balance: number }>();

    const map = new Map<string, { name: string; balance: number }>();

    for (const alloc of allocations) {
      const name = alloc.funding_source?.name ?? alloc.funding_source_id;
      map.set(alloc.funding_source_id, {
        name,
        balance: Number(alloc.total_contribution),
      });
    }

    return map;
  }, [allocations]);

  // ─── Capacidad combinada de fuentes seleccionadas ─────────

  const combinedCapacity = useMemo(() => {
    let sum = 0;
    for (const id of selectedFundingSourceIds) {
      sum += fundingSourceBalances.get(id)?.balance ?? 0;
    }
    return sum;
  }, [selectedFundingSourceIds, fundingSourceBalances]);

  const hasEnoughCapacity = combinedCapacity >= totalAmount;

  // ─── Suma asignada en paso 2 ──────────────────────────────

  const totalAssigned = distributionRows.reduce((s, r) => s + (r.assignedAmount ?? 0), 0);
  const assignedDifference = Math.abs(totalAssigned - totalAmount);
  const isAssignedExact = assignedDifference < 0.01;

  const hasRowErrors = distributionRows.some(
    (r) => r.assignedAmount > r.availableBalance,
  );

  // ─── Abrir diálogo ───────────────────────────────────────

  function openDialog() {
    setStep("select");
    setTotalAmount(totalCost);
    setSelectedFundingSourceIds(new Set());
    setDistributionRows([]);
    setIsDialogOpen(true);
  }

  // ─── Toggle selección de fuente ───────────────────────────

  function toggleFundingSource(fundingSourceId: string) {
    setSelectedFundingSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(fundingSourceId)) {
        next.delete(fundingSourceId);
      } else {
        next.add(fundingSourceId);
      }
      return next;
    });
  }

  // ─── Calcular distribución sugerida ─────────────────────

  async function handleCalculate() {
    if (selectedFundingSourceIds.size === 0 || !hasEnoughCapacity) return;
    try {
      const suggestions: FundingSourceSuggestion[] = await suggest(
        lineId,
        Array.from(selectedFundingSourceIds),
        totalAmount,
      );
      setDistributionRows(
        suggestions.map((s) => ({
          fundingSourceId: s.fundingSourceId,
          fundingSourceName: s.fundingSourceName,
          suggestedAmount: s.suggestedAmount,
          availableBalance: s.availableBalance,
          assignedAmount: s.suggestedAmount,
        })),
      );
      setStep("distribute");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error al calcular distribución";
      toast.error(message);
    }
  }

  // ─── Actualizar monto asignado ───────────────────────────

  function updateAssigned(fundingSourceId: string, value: string) {
    const num = parseFloat(value) || 0;
    setDistributionRows((prev) =>
      prev.map((r) => (r.fundingSourceId === fundingSourceId ? { ...r, assignedAmount: num } : r)),
    );
  }

  // ─── Confirmar distribución ──────────────────────────────

  async function handleConfirm() {
    if (!isAssignedExact || hasRowErrors) return;

    let anyError = false;
    for (const row of distributionRows) {
      try {
        await add(lineId, row.fundingSourceId, row.assignedAmount);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : `Error al agregar ${row.fundingSourceName}`;
        toast.error(message);
        anyError = true;
        break;
      }
    }

    if (!anyError) {
      toast.success("Distribución de fuentes de financiamiento guardada exitosamente");
      setIsDialogOpen(false);
      void refetchFundingSources();
    }
  }

  // ─── Eliminar fuente de la línea ──────────────────────────

  async function handleRemoveFundingSource(fs: LineFundingSource) {
    try {
      await remove(lineId, fs.funding_source_id);
      toast.success("Fuente de financiamiento eliminada de la línea");
      void refetchFundingSources();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error al eliminar fuente de financiamiento";
      toast.error(message);
    }
  }

  // ─── Render ───────────────────────────────────────────────

  if (loadingFundingSources) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const fundingSources = lineFundingSources ?? [];
  const hasFundingSources = fundingSources.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Header con botón de acción */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Fuentes de financiamiento</h2>
        {isDraft && (
          <Button variant="outline" size="sm" onClick={openDialog}>
            <Users className="mr-2 h-4 w-4" />
            {hasFundingSources ? "Reconfigurar" : "+ Configurar"}
          </Button>
        )}
      </div>

      {/* Tabla de fuentes existentes */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fuente</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="text-right">Porcentaje</TableHead>
              {isDraft && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {fundingSources.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isDraft ? 4 : 3}
                  className="text-center text-muted-foreground py-8"
                >
                  Sin fuentes de financiamiento asignadas a esta línea
                </TableCell>
              </TableRow>
            ) : (
              <>
                {fundingSources.map((fs) => (
                  <TableRow key={fs.id}>
                    <TableCell>
                      {fs.funding_source?.name ?? fs.funding_source_id}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(Number(fs.allocated_amount))}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatPercent(Number(fs.percentage))}
                    </TableCell>
                    {isDraft && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={isRemoving}
                          onClick={() => handleRemoveFundingSource(fs)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {/* Fila de total */}
                <TableRow className="font-semibold bg-muted/50">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(
                      fundingSources.reduce((s, fs) => s + Number(fs.allocated_amount), 0),
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatPercent(
                      fundingSources.reduce((s, fs) => s + Number(fs.percentage), 0),
                    )}
                  </TableCell>
                  {isDraft && <TableCell />}
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* ─── Diálogo ─── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {step === "select" && (
            <StepSelect
              totalAmount={totalAmount}
              totalCost={totalCost}
              selectedFundingSourceIds={selectedFundingSourceIds}
              fundingSourceBalances={fundingSourceBalances}
              loadingAllocations={loadingAllocations}
              combinedCapacity={combinedCapacity}
              hasEnoughCapacity={hasEnoughCapacity}
              isSuggesting={isSuggesting}
              onTotalAmountChange={setTotalAmount}
              onToggleFundingSource={toggleFundingSource}
              onCalculate={handleCalculate}
              onCancel={() => setIsDialogOpen(false)}
            />
          )}
          {step === "distribute" && (
            <StepDistribute
              distributionRows={distributionRows}
              totalAmount={totalAmount}
              totalAssigned={totalAssigned}
              isAssignedExact={isAssignedExact}
              hasRowErrors={hasRowErrors}
              isAdding={isAdding}
              onUpdateAssigned={updateAssigned}
              onBack={() => setStep("select")}
              onConfirm={handleConfirm}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Paso 1: Selección de fuentes de financiamiento ──────

interface StepSelectProps {
  totalAmount: number;
  totalCost: number;
  selectedFundingSourceIds: Set<string>;
  fundingSourceBalances: Map<string, { name: string; balance: number }>;
  loadingAllocations: boolean;
  combinedCapacity: number;
  hasEnoughCapacity: boolean;
  isSuggesting: boolean;
  onTotalAmountChange: (v: number) => void;
  onToggleFundingSource: (id: string) => void;
  onCalculate: () => void;
  onCancel: () => void;
}

function StepSelect({
  totalAmount,
  selectedFundingSourceIds,
  fundingSourceBalances,
  loadingAllocations,
  combinedCapacity,
  hasEnoughCapacity,
  isSuggesting,
  onTotalAmountChange,
  onToggleFundingSource,
  onCalculate,
  onCancel,
}: StepSelectProps) {
  const canCalculate =
    selectedFundingSourceIds.size > 0 && hasEnoughCapacity && totalAmount > 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Agregar fuentes de financiamiento a esta línea</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-6 py-2">
        {/* Campo: Monto total */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">
            Monto total a distribuir
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">S/</span>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={totalAmount}
              onChange={(e) => onTotalAmountChange(parseFloat(e.target.value) || 0)}
              className="max-w-xs"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Puede distribuir un monto menor al costo total de la línea si lo desea.
          </p>
        </div>

        {/* Lista de fuentes */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">
            Seleccionar fuentes de financiamiento participantes
          </label>

          {loadingAllocations ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : fundingSourceBalances.size === 0 ? (
            <p className="text-sm text-muted-foreground rounded-lg border p-4">
              No hay fuentes de financiamiento con aportes registrados para este año fiscal.
              Registre los aportes en la sección de Aportes de Fuentes.
            </p>
          ) : (
            <div className="flex flex-col gap-1 rounded-lg border divide-y max-h-64 overflow-y-auto">
              {Array.from(fundingSourceBalances.entries()).map(([id, { name, balance }]) => {
                const isSelected = selectedFundingSourceIds.has(id);
                const noBalance = balance <= 0;
                return (
                  <label
                    key={id}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-3 cursor-pointer",
                      noBalance
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={isSelected}
                        disabled={noBalance}
                        onChange={() => onToggleFundingSource(id)}
                      />
                      <span className="text-sm font-medium">{name}</span>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-mono",
                        noBalance ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      Saldo disponible: {formatCurrency(balance)}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Indicador de capacidad */}
        {selectedFundingSourceIds.size > 0 && (
          <div
            className={cn(
              "rounded-lg border p-3 text-sm",
              hasEnoughCapacity
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-destructive/30 bg-destructive/5 text-destructive",
            )}
          >
            <span className="font-medium">
              Capacidad combinada: {formatCurrency(combinedCapacity)}
            </span>
            {hasEnoughCapacity ? (
              <span className="ml-2">✓ Capacidad suficiente para cubrir el monto requerido</span>
            ) : (
              <span className="ml-2">
                El saldo disponible de las fuentes seleccionadas es insuficiente para cubrir
                el monto requerido. Seleccione más fuentes o reduzca el monto.
              </span>
            )}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          onClick={onCalculate}
          disabled={!canCalculate || isSuggesting}
        >
          {isSuggesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Calcular distribución
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </DialogFooter>
    </>
  );
}

// ─── Paso 2: Tabla editable de distribución ───────────────

interface StepDistributeProps {
  distributionRows: DistributionRow[];
  totalAmount: number;
  totalAssigned: number;
  isAssignedExact: boolean;
  hasRowErrors: boolean;
  isAdding: boolean;
  onUpdateAssigned: (fundingSourceId: string, value: string) => void;
  onBack: () => void;
  onConfirm: () => void;
}

function StepDistribute({
  distributionRows,
  totalAmount,
  totalAssigned,
  isAssignedExact,
  hasRowErrors,
  isAdding,
  onUpdateAssigned,
  onBack,
  onConfirm,
}: StepDistributeProps) {
  const canConfirm = isAssignedExact && !hasRowErrors;
  const difference = totalAssigned - totalAmount;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Revisar distribución de fuentes de financiamiento</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        <p className="text-sm text-muted-foreground">
          Revise y ajuste los montos asignados. La suma debe coincidir exactamente con el
          monto total de{" "}
          <span className="font-medium text-foreground">
            {formatCurrency(totalAmount)}
          </span>.
        </p>

        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fuente</TableHead>
                <TableHead className="text-right">Saldo disponible</TableHead>
                <TableHead className="text-right">Sugerido</TableHead>
                <TableHead className="text-right w-40">Asignado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {distributionRows.map((row) => {
                const hasError = row.assignedAmount > row.availableBalance;
                return (
                  <TableRow
                    key={row.fundingSourceId}
                    className={hasError ? "bg-destructive/5" : undefined}
                  >
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{row.fundingSourceName}</span>
                        {hasError && (
                          <span className="text-xs text-destructive">
                            El monto supera el saldo disponible de la fuente (
                            {formatCurrency(row.availableBalance)})
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatCurrency(row.availableBalance)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {formatCurrency(row.suggestedAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={row.assignedAmount}
                        onChange={(e) => onUpdateAssigned(row.fundingSourceId, e.target.value)}
                        className={cn(
                          "w-36 text-right font-mono",
                          hasError && "border-destructive focus-visible:ring-destructive",
                        )}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Footer con totales */}
          <div
            className={cn(
              "flex items-center justify-between px-4 py-3 border-t text-sm font-medium",
              !isAssignedExact
                ? "bg-destructive/5 text-destructive"
                : "bg-green-50 text-green-800",
            )}
          >
            <span>Total asignado</span>
            <div className="flex items-center gap-4">
              <span className="font-mono">{formatCurrency(totalAssigned)}</span>
              {!isAssignedExact && (
                <span className="text-xs">
                  {difference > 0
                    ? `Excede en ${formatCurrency(difference)}`
                    : `Faltan ${formatCurrency(Math.abs(difference))}`}{" "}
                  del total requerido ({formatCurrency(totalAmount)})
                </span>
              )}
              {isAssignedExact && (
                <span className="text-xs">✓ Suma correcta</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onBack} disabled={isAdding}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Volver a selección
        </Button>
        <Button onClick={onConfirm} disabled={!canConfirm || isAdding}>
          {isAdding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Confirmar distribución
        </Button>
      </DialogFooter>
    </>
  );
}
