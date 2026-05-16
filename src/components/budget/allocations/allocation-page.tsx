"use client";

import { useState } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAuthStore } from "@/stores/auth-store";
import { useFiscalYears } from "@/hooks/use-budget";
import { AllocationTable } from "./allocation-table";
import { AllocationForm } from "./allocation-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";

// -------------------------------------------------------
// AllocationPage component
// -------------------------------------------------------

export function AllocationPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  const { data: fiscalYears, isLoading: fyLoading } = useFiscalYears();

  const [selectedFiscalYearId, setSelectedFiscalYearId] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);

  // Seleccionar primer año fiscal disponible automáticamente
  useEffect(() => {
    if (!selectedFiscalYearId && fiscalYears && fiscalYears.length > 0) {
      // Preferir el año activo si existe
      const active = fiscalYears.find((fy) => fy.status === "ACTIVE");
      setSelectedFiscalYearId(active?.id ?? fiscalYears[0].id);
    }
  }, [fiscalYears, selectedFiscalYearId]);

  // Proteger por rol
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
          <h1 className="text-2xl font-bold tracking-tight">Aportes por Socio</h1>
          <p className="text-muted-foreground">
            Registro de contribuciones de socios por año fiscal
          </p>
        </div>
        {canCreate && selectedFiscalYearId && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Registrar aporte
          </Button>
        )}
      </div>

      {/* Selector de año fiscal */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Año fiscal:</span>
        {fyLoading ? (
          <Skeleton className="h-9 w-48" />
        ) : (
          <Select
            value={selectedFiscalYearId}
            onValueChange={setSelectedFiscalYearId}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Seleccionar año..." />
            </SelectTrigger>
            <SelectContent>
              {fiscalYears?.map((fy) => (
                <SelectItem key={fy.id} value={fy.id}>
                  {fy.year}{" "}
                  {fy.status === "ACTIVE" ? "(Activo)" : fy.status === "CLOSED" ? "(Cerrado)" : "(Borrador)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Tabla */}
      {selectedFiscalYearId ? (
        <AllocationTable
          key={`${selectedFiscalYearId}-${refetchKey}`}
          fiscalYearId={selectedFiscalYearId}
          onRefetch={() => setRefetchKey((k) => k + 1)}
        />
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Selecciona un año fiscal para ver los aportes.
        </p>
      )}

      {/* Modal crear */}
      <Dialog open={showCreate} onOpenChange={(o) => !o && setShowCreate(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar aporte de socio</DialogTitle>
          </DialogHeader>
          <AllocationForm
            fiscalYearId={selectedFiscalYearId}
            onClose={() => setShowCreate(false)}
            onSuccess={() => setRefetchKey((k) => k + 1)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
