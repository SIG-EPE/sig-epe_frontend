"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BudgetProgramTable } from "./budget-program-table";
import { BudgetProgramForm } from "./budget-program-form";

export function BudgetProgramPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Programas / Proyectos / Gestiones</h1>
          <p className="text-muted-foreground">
            Gestión de programas presupuestales, proyectos y gestiones
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Nuevo programa
        </Button>
      </div>

      <BudgetProgramTable key={refetchKey} onRefetch={() => setRefetchKey((k) => k + 1)} />

      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear programa</DialogTitle>
          </DialogHeader>
          <BudgetProgramForm
            onClose={() => setShowCreate(false)}
            onSuccess={() => setRefetchKey((k) => k + 1)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
