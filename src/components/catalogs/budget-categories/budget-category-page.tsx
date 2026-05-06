"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BudgetCategoryTable } from "./budget-category-table";
import { BudgetCategoryForm } from "./budget-category-form";

export function BudgetCategoryPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tipos de Recurso</h1>
          <p className="text-muted-foreground">Clasificación de recursos presupuestales (RO, RDR, donaciones, etc.)</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Nuevo tipo
        </Button>
      </div>

      <BudgetCategoryTable key={refetchKey} onRefetch={() => setRefetchKey((k) => k + 1)} />

      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Crear tipo de recurso</DialogTitle></DialogHeader>
          <BudgetCategoryForm onClose={() => setShowCreate(false)} onSuccess={() => setRefetchKey((k) => k + 1)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
