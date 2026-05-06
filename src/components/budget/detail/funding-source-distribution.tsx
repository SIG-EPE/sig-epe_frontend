"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Users, Loader2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  useLineFundingSources,
  useAddLineFundingSource,
  useRemoveLineFundingSource,
  type LineFundingSource,
} from "@/hooks/use-budget";
import { useCatalogFundingSources } from "@/hooks/use-catalogs";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────

interface FundingSourceDistributionProps {
  lineId: string;
  totalCost: number;
  fiscalYearId: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
}

// ─── Componente principal ─────────────────────────────────

export function FundingSourceDistribution({
  lineId,
  status,
}: FundingSourceDistributionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Fuentes ya asignadas a esta línea
  const {
    data: lineFundingSources,
    isLoading: loadingFundingSources,
    refetch: refetchFundingSources,
  } = useLineFundingSources(lineId);

  // Catálogo completo de fuentes
  const { data: catalogSources, isLoading: loadingCatalog } =
    useCatalogFundingSources();

  const { add, isLoading: isAdding } = useAddLineFundingSource();
  const { remove, isLoading: isRemoving } = useRemoveLineFundingSource();

  const isDraft = status === "DRAFT";

  // ─── Estado de selección en el diálogo ───────────────────

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inicializar selección al abrir el diálogo
  function openDialog() {
    const assignedIds = new Set(
      (lineFundingSources ?? []).map((fs) => fs.funding_source_id),
    );
    setSelectedIds(assignedIds);
    setIsDialogOpen(true);
  }

  // Sincronizar selección si lineFundingSources cambia mientras el diálogo está cerrado
  useEffect(() => {
    if (!isDialogOpen) return;
    // Don't reset while open — user may be editing
  }, [isDialogOpen]);

  function toggleSource(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // ─── Guardar cambios ─────────────────────────────────────

  async function handleSave() {
    const currentIds = new Set(
      (lineFundingSources ?? []).map((fs) => fs.funding_source_id),
    );

    const toAdd = [...selectedIds].filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !selectedIds.has(id));

    let anyError = false;

    for (const id of toAdd) {
      try {
        await add(lineId, id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : `Error al agregar fuente ${id}`;
        toast.error(msg);
        anyError = true;
        break;
      }
    }

    if (!anyError) {
      for (const id of toRemove) {
        try {
          await remove(lineId, id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : `Error al eliminar fuente ${id}`;
          toast.error(msg);
          anyError = true;
          break;
        }
      }
    }

    if (!anyError) {
      toast.success("Fuentes de financiamiento actualizadas");
      setIsDialogOpen(false);
      void refetchFundingSources();
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
  const isSaving = isAdding || isRemoving;

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
              <TableHead>Nombre</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fundingSources.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={1}
                  className="text-center text-muted-foreground py-8"
                >
                  Sin fuentes de financiamiento asignadas a esta línea
                </TableCell>
              </TableRow>
            ) : (
              fundingSources.map((fs) => (
                <TableRow key={fs.id}>
                  <TableCell>
                    {fs.fundingSource?.name ?? (
                      <span className="text-muted-foreground text-xs">{fs.funding_source_id}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ─── Diálogo de selección ─── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Seleccionar fuentes de financiamiento</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {loadingCatalog ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : !catalogSources || catalogSources.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-lg border p-4">
                No hay fuentes de financiamiento disponibles en el catálogo.
              </p>
            ) : (
              <div className="flex flex-col gap-1 rounded-lg border divide-y max-h-80 overflow-y-auto">
                {catalogSources.map((source) => {
                  const isSelected = selectedIds.has(source.id);
                  return (
                    <label
                      key={source.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input accent-primary"
                        checked={isSelected}
                        onChange={() => toggleSource(source.id)}
                      />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">{source.name}</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {source.code}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
