"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TerritoryTable } from "./territory-table";
import { TerritoryForm } from "./territory-form";

export function TerritoryPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Territorios</h1>
          <p className="text-muted-foreground">Gestión de territorios jerárquicos (Región, Provincia, Distrito)</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Nuevo territorio
        </Button>
      </div>

      <TerritoryTable key={refetchKey} onRefetch={() => setRefetchKey((k) => k + 1)} />

      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Crear territorio</DialogTitle></DialogHeader>
          <TerritoryForm onClose={() => setShowCreate(false)} onSuccess={() => setRefetchKey((k) => k + 1)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
