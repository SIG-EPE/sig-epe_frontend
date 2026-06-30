"use client";

import { useState } from "react";
import { Pencil, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";

import {
  useCatalogFundingSourceTypes,
  useDeactivateFundingSourceType,
  useReactivateFundingSourceType,
} from "@/hooks/use-catalogs";
import type { FundingSourceType } from "@/types/catalogs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CatalogStatusBadge } from "../shared/catalog-status-badge";
import { CatalogDeactivateModal } from "../shared/catalog-deactivate-modal";
import { FundingSourceTypeForm } from "./funding-source-type-form";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface FundingSourceTypeTableProps {
  canManage?: boolean;
  onRefetch?: () => void;
}

function DeactivateWrapper({ item, open, onClose, onSuccess }: { item: FundingSourceType; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { deactivate, isLoading } = useDeactivateFundingSourceType(item.id);
  const handleConfirm = async () => {
    try {
      await deactivate();
      toast.success("Tipo de fuente de financiamiento desactivado");
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

function ReactivateButton({ item, onSuccess }: { item: FundingSourceType; onSuccess: () => void }) {
  const { reactivate, isLoading } = useReactivateFundingSourceType(item.id);
  const handleReactivate = async () => {
    try {
      await reactivate();
      toast.success("Tipo de fuente de financiamiento reactivado");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al reactivar");
    }
  };

  return (
    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleReactivate} disabled={isLoading} title="Reactivar">
      <Power className="h-4 w-4" />
    </Button>
  );
}

export function FundingSourceTypeTable({ canManage = false, onRefetch }: FundingSourceTypeTableProps) {
  const { data, isLoading, error } = useCatalogFundingSourceTypes();
  const [editItem, setEditItem] = useState<FundingSourceType | null>(null);
  const [deactivateItem, setDeactivateItem] = useState<FundingSourceType | null>(null);
  const refetch = onRefetch ?? (() => undefined);

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
        Error al cargar tipos de fuente de financiamiento: {String(error)}
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay tipos de fuente de financiamiento registrados.
      </p>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Estado</TableHead>
              {canManage && <TableHead className="w-[120px]">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-muted-foreground">{item.description ?? "-"}</TableCell>
                <TableCell>
                  <CatalogStatusBadge isActive={item.is_active} />
                </TableCell>
                {canManage && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditItem(item)} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {item.is_active ? (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeactivateItem(item)} title="Desactivar">
                          <PowerOff className="h-4 w-4" />
                        </Button>
                      ) : (
                        <ReactivateButton item={item} onSuccess={refetch} />
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editItem && (
        <Dialog open onOpenChange={(open) => !open && setEditItem(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar tipo de fuente de financiamiento</DialogTitle>
            </DialogHeader>
            <FundingSourceTypeForm item={editItem} onClose={() => setEditItem(null)} onSuccess={refetch} />
          </DialogContent>
        </Dialog>
      )}

      {deactivateItem && (
        <DeactivateWrapper item={deactivateItem} open onClose={() => setDeactivateItem(null)} onSuccess={refetch} />
      )}
    </>
  );
}
