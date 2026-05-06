"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  useFundingSourceAllocations,
  useDeleteFundingSourceAllocation,
  useFundingSources,
  useFiscalYears,
  type FundingSourceAllocation,
} from "@/hooks/use-budget";
import { AllocationForm } from "./allocation-form";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Trash2 } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

// -------------------------------------------------------
// ConfirmarEliminacion — sub-componente modal
// -------------------------------------------------------

interface ConfirmarEliminacionProps {
  allocation: FundingSourceAllocation;
  partnerName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function ConfirmarEliminacion({
  allocation,
  partnerName,
  open,
  onClose,
  onSuccess,
}: ConfirmarEliminacionProps) {
  const { remove, isLoading } = useDeleteFundingSourceAllocation();

  const handleConfirm = async () => {
    try {
      await remove(allocation.id);
      toast.success("Aporte eliminado exitosamente");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar aporte");
    } finally {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar aporte</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de que deseas eliminar el aporte de{" "}
            <strong>{partnerName}</strong>? Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "Eliminando..." : "Eliminar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface AllocationTableProps {
  fiscalYearId: string;
  onRefetch: () => void;
}

// -------------------------------------------------------
// AllocationTable component
// -------------------------------------------------------

export function AllocationTable({ fiscalYearId, onRefetch }: AllocationTableProps) {
  const { data: allocations, isLoading, error } = useFundingSourceAllocations(fiscalYearId);
  const { data: partners } = useFundingSources();
  const { data: fiscalYears } = useFiscalYears();
  const user = useAuthStore((s) => s.user);

  const roleCode = user?.role?.code;
  const canManage = roleCode === "GIOF_GESTOR" || roleCode === "ADMIN_SISTEMA";

  // Estado para modales
  const [editingAllocation, setEditingAllocation] = useState<FundingSourceAllocation | null>(null);
  const [deletingAllocation, setDeletingAllocation] = useState<FundingSourceAllocation | null>(null);

  // Helper para obtener nombre de fuente de financiamiento
  const getFundingSourceName = (fundingSourceId: string) => {
    if (!partners) return fundingSourceId;
    return partners.find((p) => p.id === fundingSourceId)?.name ?? fundingSourceId;
  };

  const getFiscalYearLabel = (fyId: string) => {
    if (!fiscalYears) return fyId;
    return fiscalYears.find((fy) => fy.id === fyId)?.year?.toString() ?? fyId;
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
      minimumFractionDigits: 2,
    }).format(amount);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Error al cargar aportes: {String(error)}
      </p>
    );
  }

  if (!allocations || allocations.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay aportes registrados para este año fiscal.
      </p>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Año Fiscal</TableHead>
              <TableHead>Fuente de Financiamiento</TableHead>
              <TableHead className="text-right">Monto Total</TableHead>
              <TableHead>Notas</TableHead>
              {canManage && <TableHead>Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {allocations.map((alloc) => (
              <TableRow key={alloc.id}>
                <TableCell className="font-medium">
                  {alloc.fiscal_year?.year ?? getFiscalYearLabel(alloc.fiscal_year_id)}
                </TableCell>
                <TableCell>
                  {alloc.funding_source?.name ?? getFundingSourceName(alloc.funding_source_id)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(alloc.total_contribution)}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-xs truncate">
                  {alloc.notes ?? "-"}
                </TableCell>
                {canManage && (
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => setEditingAllocation(alloc)}
                      >
                        <Pencil className="h-3 w-3" />
                        Editar
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeletingAllocation(alloc)}
                      >
                        <Trash2 className="h-3 w-3" />
                        Eliminar
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Modal editar */}
      {editingAllocation && (
        <Dialog open onOpenChange={(o) => !o && setEditingAllocation(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar aporte</DialogTitle>
            </DialogHeader>
            <AllocationForm
              fiscalYearId={fiscalYearId}
              existingAllocation={editingAllocation}
              onClose={() => setEditingAllocation(null)}
              onSuccess={() => {
                onRefetch();
                setEditingAllocation(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Modal eliminar */}
      {deletingAllocation && (
        <ConfirmarEliminacion
          allocation={deletingAllocation}
          partnerName={
            deletingAllocation.funding_source?.name ?? getFundingSourceName(deletingAllocation.funding_source_id)
          }
          open
          onClose={() => setDeletingAllocation(null)}
          onSuccess={onRefetch}
        />
      )}
    </>
  );
}
