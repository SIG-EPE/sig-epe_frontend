"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/stores/auth-store";
import { ROLE_CODE } from "@/lib/constants";
import { FundingSourceTypeForm } from "./funding-source-type-form";
import { FundingSourceTypeTable } from "./funding-source-type-table";

function canManageFundingSourceTypes(roleCode: string | undefined): boolean {
  return roleCode === ROLE_CODE.GIOF_GESTOR || roleCode === ROLE_CODE.ADMIN_SISTEMA;
}

export function FundingSourceTypePage() {
  const [showCreate, setShowCreate] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);
  const user = useAuthStore((state) => state.user);
  const canManage = canManageFundingSourceTypes(user?.role?.code);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tipos de Fuente de Financiamiento</h1>
          <p className="text-muted-foreground">
            Categorías de fuentes: Presupuestado, No Presupuestado, Back Office, etc.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Nuevo tipo
          </Button>
        )}
      </div>

      <FundingSourceTypeTable
        key={refetchKey}
        canManage={canManage}
        onRefetch={() => setRefetchKey((current) => current + 1)}
      />

      <Dialog open={showCreate} onOpenChange={(open) => !open && setShowCreate(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear tipo de fuente de financiamiento</DialogTitle>
          </DialogHeader>
          <FundingSourceTypeForm
            onClose={() => setShowCreate(false)}
            onSuccess={() => setRefetchKey((current) => current + 1)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
