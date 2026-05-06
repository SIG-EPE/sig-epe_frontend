"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { FiscalYearTable } from "./fiscal-year-table";
import { FiscalYearForm } from "./fiscal-year-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useState } from "react";

// -------------------------------------------------------
// FiscalYearPage component
// -------------------------------------------------------

export function FiscalYearPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  // Proteger por rol SOLICITANTE_EPE
  useEffect(() => {
    if (user?.role?.code === "SOLICITANTE_EPE") {
      toast.warning("No tienes acceso a esta página");
      router.replace("/budget");
    }
  }, [user, router]);

  const roleCode = user?.role?.code;
  const canCreate = roleCode === "GIOF_GESTOR" || roleCode === "ADMIN_SISTEMA";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Años Fiscales</h1>
          <p className="text-muted-foreground">
            Gestión de años fiscales y sus estados
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Crear año fiscal
          </Button>
        )}
      </div>

      {/* Tabla */}
      <FiscalYearTable key={refetchKey} onRefetch={() => setRefetchKey((k) => k + 1)} />

      {/* Modal crear */}
      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear año fiscal</DialogTitle>
          </DialogHeader>
          <FiscalYearForm
            onClose={() => setShowCreate(false)}
            onSuccess={() => setRefetchKey((k) => k + 1)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
