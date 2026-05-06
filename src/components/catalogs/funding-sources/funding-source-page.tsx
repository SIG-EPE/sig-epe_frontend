"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FundingSourceTable } from "./funding-source-table";
import { FundingSourceForm } from "./funding-source-form";

export function FundingSourcePage() {
  const [showCreate, setShowCreate] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fuentes de Financiamiento</h1>
          <p className="text-muted-foreground">Directorio de fuentes de financiamiento del sistema presupuestario</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Nueva fuente
        </Button>
      </div>

      <FundingSourceTable key={refetchKey} onRefetch={() => setRefetchKey((k) => k + 1)} />

      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Crear fuente de financiamiento</DialogTitle></DialogHeader>
          <FundingSourceForm onClose={() => setShowCreate(false)} onSuccess={() => setRefetchKey((k) => k + 1)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
