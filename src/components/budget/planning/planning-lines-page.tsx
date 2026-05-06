"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlanningLinesTable } from "./planning-lines-table";
import {
  usePlanningLines,
  useFiscalYears,
  useOrganizationalUnits,
  usePlanningLineStats,
} from "@/hooks/use-budget";
import { ROUTES } from "@/lib/constants";
import { Plus, FileText, Send, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

// -------------------------------------------------------
// PlanningLinesPage
// Pagina de lista con filtros y paginacion
// -------------------------------------------------------

const STATUS_OPTIONS = [
  { value: "all", label: "Todos los estados" },
  { value: "DRAFT", label: "Borrador" },
  { value: "SUBMITTED", label: "Enviado" },
  { value: "APPROVED", label: "Aprobado" },
  { value: "REJECTED", label: "Rechazado" },
];

export function PlanningLinesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data: fiscalYearsData } = useFiscalYears();
  const { data: orgUnitsData } = useOrganizationalUnits();

  const fiscalYears = fiscalYearsData ?? [];
  const orgUnits = orgUnitsData ?? [];

  // Leer filtros desde URL
  const fiscalYearId = searchParams.get("fiscal_year_id") ?? "";
  const orgUnitId = searchParams.get("org_unit_id") ?? "";
  const status = searchParams.get("status") ?? "";

  const [page, setPage] = useState(1);
  const [activeStatusFilter, setActiveStatusFilter] = useState<string | null>(null);

  // Stats para KPI cards
  const { data: stats, isLoading: statsLoading } = usePlanningLineStats(
    fiscalYearId || undefined,
    orgUnitId || undefined,
  );

  // Combinar filtro URL con filtro KPI card
  const effectiveStatus = activeStatusFilter ?? (status || undefined);

  const { lines, total, limit, isLoading, refetch } = usePlanningLines({
    fiscal_year_id: fiscalYearId || undefined,
    org_unit_id: orgUnitId || undefined,
    status: effectiveStatus,
    page,
  });

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page"); // reset page when filter changes
    router.push(`/budget/planning?${params.toString()}`);
  }

  const totalPages = Math.ceil(total / limit);

  // KPI card config
  const kpiCards = [
    {
      key: "DRAFT",
      label: "Borrador",
      icon: FileText,
      count: stats?.DRAFT.count ?? 0,
      total: stats?.DRAFT.total ?? 0,
    },
    {
      key: "SUBMITTED",
      label: "Enviados",
      icon: Send,
      count: stats?.SUBMITTED.count ?? 0,
      total: stats?.SUBMITTED.total ?? 0,
    },
    {
      key: "APPROVED",
      label: "Aprobados",
      icon: CheckCircle2,
      count: stats?.APPROVED.count ?? 0,
      total: stats?.APPROVED.total ?? 0,
    },
  ] as const;

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(amount);
  }

  function handleKpiClick(key: string) {
    setActiveStatusFilter((prev) => (prev === key ? null : key));
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado con botón agregar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planificación POA</h1>
          <p className="text-muted-foreground">
            Líneas del Plan Operativo Anual
          </p>
        </div>
        <Button onClick={() => router.push(ROUTES.BUDGET_PLANNING_NEW)}>
          <Plus className="h-4 w-4" />
          Agregar línea
        </Button>
      </div>

      {/* KPI Cards */}
      {statsLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {kpiCards.map(({ key, label, icon: Icon, count, total: cardTotal }) => (
            <Card
              key={key}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                activeStatusFilter === key
                  ? "ring-2 ring-primary"
                  : "border-border",
              )}
              onClick={() => handleKpiClick(key)}
            >
              <CardContent className="p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <p className="mt-4 text-3xl font-bold text-foreground">{count}</p>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-sm text-muted-foreground">{formatCurrency(cardTotal)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-4">
        <Select
          value={fiscalYearId || "all"}
          onValueChange={(val) => updateFilter("fiscal_year_id", val)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Ano fiscal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los anos</SelectItem>
            {fiscalYears.map((fy) => (
              <SelectItem key={fy.id} value={fy.id}>
                {fy.year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={orgUnitId || "all"}
          onValueChange={(val) => updateFilter("org_unit_id", val)}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Unidad organica" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las unidades</SelectItem>
            {orgUnits.map((ou) => (
              <SelectItem key={ou.id} value={ou.id}>
                {ou.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status || "all"}
          onValueChange={(val) => updateFilter("status", val)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <PlanningLinesTable
        lines={lines}
        isLoading={isLoading}
        onRefetch={refetch}
      />

      {/* Paginacion */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Total: {total} lineas
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages || isLoading}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
