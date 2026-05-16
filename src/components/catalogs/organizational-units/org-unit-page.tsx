"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrgUnitTable } from "./org-unit-table";
import { OrgUnitForm } from "./org-unit-form";

export function OrgUnitPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Unidades Orgánicas</h1>
          <p className="text-muted-foreground">Gestión de unidades orgánicas de la entidad</p>
        </div>
        {/* Solo crea UOs raíz (sin padre) */}
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Nueva unidad raíz
        </Button>
      </div>

      <OrgUnitTable key={refetchKey} onRefetch={() => setRefetchKey((k) => k + 1)} />

      {/* Modal crear UO raíz — sin parentId */}
      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear unidad orgánica</DialogTitle>
          </DialogHeader>
          <OrgUnitForm
            onClose={() => setShowCreate(false)}
            onSuccess={() => {
              setShowCreate(false);
              setRefetchKey((k) => k + 1);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
