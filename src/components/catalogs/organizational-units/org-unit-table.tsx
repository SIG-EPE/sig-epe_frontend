"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { ChevronRight, ChevronDown, Pencil, PowerOff, Plus } from "lucide-react";

import { useCatalogOrganizationalUnits, useDeactivateOrganizationalUnit } from "@/hooks/use-catalogs";
import type { OrganizationalUnit } from "@/types/catalogs";
import { CatalogStatusBadge } from "../shared/catalog-status-badge";
import { CatalogDeactivateModal } from "../shared/catalog-deactivate-modal";
import { OrgUnitForm } from "./org-unit-form";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

/* Wrapper de desactivación — igual que antes */
function DeactivateWrapper({
  item, open, onClose, onSuccess,
}: {
  item: OrganizationalUnit;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { deactivate, isLoading } = useDeactivateOrganizationalUnit(item.id);
  const handleConfirm = async () => {
    try {
      await deactivate();
      toast.success("Unidad orgánica desactivada");
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

interface OrgUnitTableProps {
  onRefetch: () => void;
}

export function OrgUnitTable({ onRefetch }: OrgUnitTableProps) {
  const { data, isLoading, error } = useCatalogOrganizationalUnits();

  /* Estado local del árbol */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editItem, setEditItem] = useState<OrganizationalUnit | null>(null);
  const [deactivateItem, setDeactivateItem] = useState<OrganizationalUnit | null>(null);

  /* Modal para crear sub-unidad: guarda el padre seleccionado */
  const [createChildOf, setCreateChildOf] = useState<OrganizationalUnit | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">
        Error al cargar unidades orgánicas: {String(error)}
      </p>
    );
  }
  if (!data || data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay unidades orgánicas. Crea la primera.
      </p>
    );
  }

  /* Separar raíces e hijos */
  const roots = data.filter((u) => !u.parentId);
  const childrenByParent = data.reduce<Record<string, OrganizationalUnit[]>>((acc, u) => {
    if (u.parentId) {
      (acc[u.parentId] ??= []).push(u);
    }
    return acc;
  }, {});

  /* Calcular techo disponible de un padre: techo padre - suma de hijos */
  function availableCeiling(parent: OrganizationalUnit): number | null {
    if (parent.budgetCeiling == null) return null;
    const hijos = childrenByParent[parent.id] ?? [];
    const usado = hijos.reduce((sum, h) => sum + (h.budgetCeiling ?? 0), 0);
    return parent.budgetCeiling - usado;
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function formatCeiling(value: number | null | undefined) {
    if (value == null) return "-";
    return `S/ ${value.toLocaleString("es-PE")}`;
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Sigla</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead className="text-right">Techo Presup.</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[120px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roots.map((root) => {
              const hijos = childrenByParent[root.id] ?? [];
              const isExpanded = expandedIds.has(root.id);
              const hasChildren = hijos.length > 0;

              return (
                <React.Fragment key={root.id}>
                  {/* Fila raíz */}
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={(e) => {
                      /* Ignorar clicks sobre los botones de acción */
                      if ((e.target as HTMLElement).closest("button")) return;
                      if (hasChildren) toggleExpand(root.id);
                    }}
                  >
                    <TableCell className="font-mono font-medium">{root.code ?? "-"}</TableCell>
                    <TableCell className="font-medium">{root.short_name ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {hasChildren ? (
                          isExpanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )
                        ) : (
                          /* Espacio visual para alinear con filas que tienen chevron */
                          <span className="h-4 w-4 shrink-0" />
                        )}
                        <span className="font-medium">
                          {root.name}
                          {hasChildren && (
                            <span className="ml-1 text-muted-foreground font-normal">
                              ({hijos.length})
                            </span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{root.responsibleName ?? "-"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCeiling(root.budgetCeiling)}
                    </TableCell>
                    <TableCell>
                      <CatalogStatusBadge isActive={root.is_active} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Agregar sub-unidad"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCreateChildOf(root);
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Editar"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditItem(root);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {root.is_active && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Desactivar"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeactivateItem(root);
                            }}
                          >
                            <PowerOff className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Filas hijos — solo visibles si el padre está expandido */}
                  {isExpanded &&
                    hijos.map((hijo) => (
                      <TableRow key={hijo.id} className="bg-muted/20">
                        <TableCell className="font-mono text-sm text-muted-foreground pl-10">
                          {hijo.code ?? "-"}
                        </TableCell>
                        <TableCell className="text-sm pl-10">{hijo.short_name ?? "-"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 pl-8">
                            <span className="text-muted-foreground select-none">└</span>
                            <span className="text-sm">{hijo.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{hijo.responsibleName ?? "-"}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCeiling(hijo.budgetCeiling)}
                        </TableCell>
                        <TableCell>
                          <CatalogStatusBadge isActive={hijo.is_active} />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title="Editar"
                              onClick={() => setEditItem(hijo)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {hijo.is_active && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                title="Desactivar"
                                onClick={() => setDeactivateItem(hijo)}
                              >
                                <PowerOff className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Modal edición */}
      {editItem && (
        <Dialog open onOpenChange={(o) => !o && setEditItem(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar unidad orgánica</DialogTitle>
            </DialogHeader>
            <OrgUnitForm
              item={editItem}
              onClose={() => setEditItem(null)}
              onSuccess={onRefetch}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Modal crear sub-unidad */}
      {createChildOf && (
        <Dialog open onOpenChange={(o) => !o && setCreateChildOf(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nueva sub-unidad de {createChildOf.name}</DialogTitle>
            </DialogHeader>
            <OrgUnitForm
              parentId={createChildOf.id}
              parentName={createChildOf.name}
              availableCeiling={availableCeiling(createChildOf)}
              onClose={() => setCreateChildOf(null)}
              onSuccess={() => {
                setCreateChildOf(null);
                onRefetch();
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Modal desactivar */}
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
