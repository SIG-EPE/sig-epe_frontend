"use client";

// -------------------------------------------------------
// BalanceDashboard — Contenedor principal del dashboard
// de saldos presupuestales
// -------------------------------------------------------

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useBudgetBalanceStore } from "@/stores/budget-balance-store";
import { useBalance, useFiscalYears } from "@/hooks/use-budget";
import { BalanceFilters } from "./balance-filters";
import { BalanceCards } from "./balance-cards";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

// -------------------------------------------------------
// Estado de carga inicial
// -------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Filtros skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>

      {/* Cards skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Estado de error con retry
// -------------------------------------------------------

interface ErrorViewProps {
  message: string;
  onRetry: () => void;
}

function ErrorView({ message, onRetry }: ErrorViewProps) {
  return (
      <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <div className="pl-7">
        <p className="font-medium">Error al cargar datos</p>
        <AlertDescription className="flex flex-col gap-3">
          <p>{message}</p>
          <Button variant="outline" size="sm" onClick={onRetry} className="w-fit gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Reintentar
          </Button>
        </AlertDescription>
      </div>
    </Alert>
  );
}

// -------------------------------------------------------
// Componente principal
// -------------------------------------------------------

export function BalanceDashboard() {
  const fiscalYearId = useBudgetBalanceStore((s) => s.fiscalYearId);
  const setFiscalYearId = useBudgetBalanceStore((s) => s.setFiscalYearId);
  const filters = useBudgetBalanceStore((s) => s.filters);
  const { data: balanceData, isLoading, error, refetch } = useBalance(fiscalYearId ?? "", filters);
  const { data: fiscalYears } = useFiscalYears();

  // Al montar: si no hay ano fiscal seleccionado, buscar el ACTIVE
  useEffect(() => {
    if (!fiscalYearId && fiscalYears && fiscalYears.length > 0) {
      const activeYear = fiscalYears.find((fy) => fy.status === "ACTIVE");
      if (activeYear) {
        setFiscalYearId(activeYear.id);
      } else {
        // Si no hay ACTIVE, usar el primero
        setFiscalYearId(fiscalYears[0].id);
      }
    }
  }, [fiscalYearId, fiscalYears, setFiscalYearId]);

  // Mostrar error en toast si hay warning del backend
  if (balanceData?.warning && !error) {
    toast.warning(balanceData.warning);
  }

  // Estado de carga inicial (sin fiscalYearId ancora)
  if (!fiscalYearId) {
    return (
      <div className="space-y-6">
        <BalanceFilters />
        <DashboardSkeleton />
      </div>
    );
  }

  // Error en la carga del balance
  if (error) {
    return (
      <div className="space-y-6">
        <BalanceFilters />
        <ErrorView message={error.message} onRetry={refetch} />
      </div>
    );
  }

  // Loading con datos previos o carga inicial
  if (isLoading && !balanceData) {
    return (
      <div className="space-y-6">
        <BalanceFilters />
        <DashboardSkeleton />
      </div>
    );
  }

  // Sin datos (no deberia ocurrir si tenemos fiscalYearId)
  if (!balanceData) {
    return (
      <div className="space-y-6">
        <BalanceFilters />
        <ErrorView message="No se encontraron datos para los filtros seleccionados." onRetry={refetch} />
      </div>
    );
  }

  // Dashboard completo
  return (
    <div className="space-y-6">
      <BalanceFilters />
      <BalanceCards data={balanceData} />
    </div>
  );
}
