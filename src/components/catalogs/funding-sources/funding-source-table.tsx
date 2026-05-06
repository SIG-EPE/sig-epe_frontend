"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, PowerOff } from "lucide-react";

import { useCatalogFundingSources, useDeactivateFundingSource } from "@/hooks/use-catalogs";
import type { FundingSource } from "@/types/catalogs";
import { CatalogStatusBadge } from "../shared/catalog-status-badge";
import { CatalogDeactivateModal } from "../shared/catalog-deactivate-modal";
import { FundingSourceForm } from "./funding-source-form";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

function DeactivateWrapper({ item, open, onClose, onSuccess }: { item: FundingSource; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { deactivate, isLoading } = useDeactivateFundingSource(item.id);
  const handleConfirm = async () => {
    try {
      await deactivate();
      toast.success("Fuente de financiamiento desactivada");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar");
    } finally {
      onClose();
    }
  };
  return (
    <CatalogDeactivateModal open={open} entityName={item.name} isLoading={isLoading} onClose={onClose} onConfirm={handleConfirm} />
  );
}

interface FundingSourceTableProps {
  onRefetch: () => void;
}

export function FundingSourceTable({ onRefetch }: FundingSourceTableProps) {
  const { data, isLoading, error } = useCatalogFundingSources();
  const [editItem, setEditItem] = useState<FundingSource | null>(null);
  const [deactivateItem, setDeactivateItem] = useState<FundingSource | null>(null);

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (error) return <p className="text-sm text-destructive">Error al cargar fuentes de financiamiento: {String(error)}</p>;
  if (!data || data.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No hay fuentes de financiamiento. Crea la primera.</p>;

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Descripción</TableHead>
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
                  {item.fundingSourceType ? (
                    <Badge variant="secondary">{item.fundingSourceType.name}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{item.description ?? "-"}</TableCell>
                <TableCell><CatalogStatusBadge isActive={item.is_active} /></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditItem(item)} title="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {item.is_active && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeactivateItem(item)} title="Desactivar">
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
            <DialogHeader><DialogTitle>Editar fuente de financiamiento</DialogTitle></DialogHeader>
            <FundingSourceForm item={editItem} onClose={() => setEditItem(null)} onSuccess={onRefetch} />
          </DialogContent>
        </Dialog>
      )}

      {deactivateItem && (
        <DeactivateWrapper item={deactivateItem} open onClose={() => setDeactivateItem(null)} onSuccess={onRefetch} />
      )}
    </>
  );
}
