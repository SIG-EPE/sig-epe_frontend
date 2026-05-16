"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CatalogDeactivateModalProps {
  open: boolean;
  entityName: string;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function CatalogDeactivateModal({
  open,
  entityName,
  isLoading,
  onClose,
  onConfirm,
}: CatalogDeactivateModalProps) {
  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Desactivar registro</DialogTitle>
          <DialogDescription>
            ¿Estás seguro de que deseas desactivar{" "}
            <span className="font-medium text-foreground">{entityName}</span>?
            El registro quedará inactivo pero no se eliminará del sistema.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? "Procesando..." : "Desactivar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
