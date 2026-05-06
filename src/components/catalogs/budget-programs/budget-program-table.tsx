"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, PowerOff } from "lucide-react";

import { useCatalogBudgetPrograms, useDeactivateBudgetProgram } from "@/hooks/use-catalogs";
import type { BudgetProgram, PlanningType } from "@/types/catalogs";
import { CatalogStatusBadge } from "../shared/catalog-status-badge";
import { CatalogDeactivateModal } from "../shared/catalog-deactivate-modal";
import { BudgetProgramForm } from "./budget-program-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

// -------------------------------------------------------
// PlanningTypeBadge
// -------------------------------------------------------

const PLANNING_TYPE_COLORS: Record<PlanningType, string> = {
  PROGRAMA: "border-blue-200 bg-blue-50 text-blue-700",
  PROYECTO: "border-purple-200 bg-purple-50 text-purple-700",
  GESTIÓN: "border-orange-200 bg-orange-50 text-orange-700",
};

function PlanningTypeBadge({ type }: { type?: PlanningType | null }) {
  if (!type) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={`text-xs ${PLANNING_TYPE_COLORS[type]}`}>
      {type}
    </Badge>
  );
}

// -------------------------------------------------------
// DeactivateWrapper
// -------------------------------------------------------

interface DeactivateWrapperProps {
  item: BudgetProgram;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function DeactivateWrapper({ item, open, onClose, onSuccess }: DeactivateWrapperProps) {
  const { deactivate, isLoading } = useDeactivateBudgetProgram(item.id);

  const handleConfirm = async () => {
    try {
      await deactivate();
      toast.success("Programa desactivado");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar");
    } finally {
      onClose();
    }
  };

  return (
    <CatalogDeactivateModal
      open={open}
      entityName={item.name}
      isLoading={isLoading}
      onClose={onClose}
      onConfirm={handleConfirm}
    />
  );
}

// -------------------------------------------------------
// BudgetProgramTable
// -------------------------------------------------------

interface BudgetProgramTableProps {
  onRefetch: () => void;
}

export function BudgetProgramTable({ onRefetch }: BudgetProgramTableProps) {
  const { data, isLoading, error } = useCatalogBudgetPrograms();

  const [editItem, setEditItem] = useState<BudgetProgram | null>(null);
  const [deactivateItem, setDeactivateItem] = useState<BudgetProgram | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Error al cargar programas: {String(error)}
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay programas. Crea el primero.
      </p>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo planificación</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono font-medium">{item.code}</TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>
                  <PlanningTypeBadge type={item.planningType} />
                </TableCell>
                <TableCell>
                  <CatalogStatusBadge isActive={item.is_active} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setEditItem(item)}
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {item.is_active && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeactivateItem(item)}
                        title="Desactivar"
                      >
                        <PowerOff className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editItem && (
        <Dialog open onOpenChange={(o) => !o && setEditItem(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar programa</DialogTitle>
            </DialogHeader>
            <BudgetProgramForm
              item={editItem}
              onClose={() => setEditItem(null)}
              onSuccess={onRefetch}
            />
          </DialogContent>
        </Dialog>
      )}

      {deactivateItem && (
        <DeactivateWrapper
          item={deactivateItem}
          open
          onClose={() => setDeactivateItem(null)}
          onSuccess={onRefetch}
        />
      )}
    </>
  );
}
