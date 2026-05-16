"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, PowerOff } from "lucide-react";

import { useCatalogTerritories, useDeactivateTerritory } from "@/hooks/use-catalogs";
import type { Territory, TerritoryLevel } from "@/types/catalogs";
import { CatalogStatusBadge } from "../shared/catalog-status-badge";
import { CatalogDeactivateModal } from "../shared/catalog-deactivate-modal";
import { TerritoryForm } from "./territory-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

// -------------------------------------------------------
// Level badge
// -------------------------------------------------------

const LEVEL_COLORS: Partial<Record<TerritoryLevel, string>> = {
  REGION: "border-blue-200 bg-blue-50 text-blue-700",
  PROVINCIA: "border-green-200 bg-green-50 text-green-700",
  DISTRITO: "border-orange-200 bg-orange-50 text-orange-700",
};

function LevelBadge({ level }: { level: TerritoryLevel }) {
  return (
    <Badge variant="outline" className={`text-xs ${LEVEL_COLORS[level]}`}>
      {level}
    </Badge>
  );
}

// -------------------------------------------------------
// Filter tabs
// -------------------------------------------------------

const LEVEL_OPTIONS: Array<{ value: TerritoryLevel | "ALL"; label: string }> = [
  { value: "ALL", label: "Todos" },
  { value: "REGION", label: "Regiones" },
  { value: "PROVINCIA", label: "Provincias" },
  { value: "DISTRITO", label: "Distritos" },
];

// -------------------------------------------------------
// DeactivateWrapper
// -------------------------------------------------------

function DeactivateWrapper({ item, open, onClose, onSuccess }: { item: Territory; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { deactivate, isLoading } = useDeactivateTerritory(item.id);
  const handleConfirm = async () => {
    try {
      await deactivate();
      toast.success("Territorio desactivado");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar");
    } finally {
      onClose();
    }
  };
  return <CatalogDeactivateModal open={open} entityName={item.name} isLoading={isLoading} onClose={onClose} onConfirm={handleConfirm} />;
}

// -------------------------------------------------------
// TerritoryTable
// -------------------------------------------------------

interface TerritoryTableProps {
  onRefetch: () => void;
}

export function TerritoryTable({ onRefetch }: TerritoryTableProps) {
  const [levelFilter, setLevelFilter] = useState<TerritoryLevel | "ALL">("ALL");
  const { data, isLoading, error } = useCatalogTerritories(
    levelFilter === "ALL" ? undefined : levelFilter
  );

  const [editItem, setEditItem] = useState<Territory | null>(null);
  const [deactivateItem, setDeactivateItem] = useState<Territory | null>(null);

  return (
    <>
      {/* Filtro por nivel */}
      <div className="flex flex-wrap gap-1">
        {LEVEL_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setLevelFilter(opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              levelFilter === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : error ? (
        <p className="text-sm text-destructive">Error al cargar territorios: {String(error)}</p>
      ) : !data || data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No hay territorios. Crea el primero.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Nivel</TableHead>
                <TableHead>Padre</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono font-medium">{item.code}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell><LevelBadge level={item.level} /></TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.parent?.name ?? "-"}
                  </TableCell>
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
      )}

      {editItem && (
        <Dialog open onOpenChange={(o) => !o && setEditItem(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Editar territorio</DialogTitle></DialogHeader>
            <TerritoryForm item={editItem} onClose={() => setEditItem(null)} onSuccess={onRefetch} />
          </DialogContent>
        </Dialog>
      )}

      {deactivateItem && (
        <DeactivateWrapper item={deactivateItem} open onClose={() => setDeactivateItem(null)} onSuccess={onRefetch} />
      )}
    </>
  );
}
