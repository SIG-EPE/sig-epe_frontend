"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { api } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import { ROLE_CAPABILITY, hasRoleCapability } from "@/lib/role-capabilities";
import { useAuthStore } from "@/stores/auth-store";
import {
  Plus,
  FileText,
  Send,
  CheckCircle2,
  Download,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getOrgUnitFilterLabel } from "@/lib/ui-labels";

// -------------------------------------------------------
// PlanningLinesPage
// Pagina de lista con filtros y paginacion
// -------------------------------------------------------

const STATUS_OPTIONS = [
  { value: "all", label: "Todos los estados" },
  { value: "DRAFT", label: "Borrador" },
  { value: "SUBMITTED", label: "Enviados" },
  { value: "APPROVED", label: "Aprobados" },
  { value: "REJECTED", label: "Rechazado" },
];

const CODE_SEARCH_DEBOUNCE_MS = 300;

export function PlanningLinesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsSignature = searchParams.toString();
  const user = useAuthStore((state) => state.user);

  const { data: fiscalYearsData } = useFiscalYears();
  const { data: orgUnitsData } = useOrganizationalUnits();

  const fiscalYears = fiscalYearsData ?? [];
  const orgUnits = orgUnitsData ?? [];
  const activeFiscalYear = fiscalYears.find((fy) => fy.status === "ACTIVE");

  // Leer filtros desde URL
  const fiscalYearId = searchParams.get("fiscal_year_id") ?? "";
  const orgUnitId = searchParams.get("org_unit_id") ?? "";
  const status = searchParams.get("status") ?? "";
  const urlCode = searchParams.get("code") ?? "";
  const effectiveStatus = status || undefined;
  const effectiveFiscalYearId = fiscalYearId || activeFiscalYear?.id;

  const [page, setPage] = useState(1);
  const [codeInput, setCodeInput] = useState(urlCode);
  const [isExporting, setIsExporting] = useState(false);
  const syncingCodeFromUrlRef = useRef(false);
  const debouncedCode = useDebouncedValue(
    codeInput.trim(),
    CODE_SEARCH_DEBOUNCE_MS,
  );
  const effectiveCode = codeInput.trim() ? debouncedCode : "";
  const canExport = hasRoleCapability(
    user?.role?.code,
    ROLE_CAPABILITY.BUDGET_ADMIN,
  );

  function replaceCodeQuery(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (code) params.set("code", code);
    else params.delete("code");
    params.delete("page");
    setPage(1);
    const query = params.toString();
    router.replace(
      query ? `${ROUTES.BUDGET_PLANNING}?${query}` : ROUTES.BUDGET_PLANNING,
      { scroll: false },
    );
  }

  useEffect(() => {
    if (urlCode !== codeInput) {
      syncingCodeFromUrlRef.current = true;
      setCodeInput(urlCode);
    }
    setPage(1);
    // URL navigation is authoritative for restoring filter state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsSignature]);

  useEffect(() => {
    if (syncingCodeFromUrlRef.current) {
      if (debouncedCode === urlCode.trim()) {
        syncingCodeFromUrlRef.current = false;
      }
      return;
    }
    if (debouncedCode === urlCode.trim()) return;
    replaceCodeQuery(debouncedCode);
    // The URL signature changes after replace and supplies the next canonical value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedCode]);

  // Stats para KPI cards
  const { data: stats, isLoading: statsLoading } = usePlanningLineStats(
    effectiveFiscalYearId,
    orgUnitId || undefined,
  );

  const { lines, total, limit, isLoading, isRefreshing, error, refetch } =
    usePlanningLines({
      fiscal_year_id: effectiveFiscalYearId,
      org_unit_id: orgUnitId || undefined,
      status: effectiveStatus,
      code: effectiveCode || undefined,
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
    setPage(1);
    const queryString = params.toString();
    router.push(
      queryString ? `/budget/planning?${queryString}` : "/budget/planning",
    );
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
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: "PEN",
    }).format(amount);
  }

  function handleKpiClick(key: string) {
    updateFilter("status", status === key ? "all" : key);
  }

  function clearCodeSearch() {
    syncingCodeFromUrlRef.current = false;
    setCodeInput("");
    replaceCodeQuery("");
  }

  async function handleExportExcel() {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (effectiveFiscalYearId)
        params.set("fiscal_year_id", effectiveFiscalYearId);
      if (orgUnitId) params.set("org_unit_id", orgUnitId);
      if (effectiveStatus) params.set("status", effectiveStatus);
      params.set(
        "measure_authority",
        process.env.NEXT_PUBLIC_POA_SOURCE_MONTHS_ENABLED === "true"
          ? "source"
          : "operational",
      );

      const query = params.toString() ? `?${params.toString()}` : "";
      const { blob, filename } = await api.download(
        `/budget/planning-lines/export.xlsx${query}`,
      );
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename ?? "lineas-poa.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      toast.success("Excel generado con fuente exacta y datos actuales");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo exportar el Excel",
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado con botón agregar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Planificación POA
          </h1>
          <p className="text-muted-foreground">
            Líneas del Plan Operativo Anual
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExport && (
            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={isExporting}
            >
              <Download className="h-4 w-4" />
              {isExporting
                ? "Exportando..."
                : "Exportar Excel (fuente + actual)"}
            </Button>
          )}
          <Button onClick={() => router.push(ROUTES.BUDGET_PLANNING_NEW)}>
            <Plus className="h-4 w-4" />
            Agregar línea
          </Button>
        </div>
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
          {kpiCards.map(
            ({ key, label, icon: Icon, count, total: cardTotal }) => (
              <Card
                key={key}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md",
                  status === key ? "ring-2 ring-primary" : "border-border",
                )}
                onClick={() => handleKpiClick(key)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-3xl font-bold text-foreground">
                      {count}
                    </p>
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">{label}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(cardTotal)}
                  </p>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:flex xl:flex-wrap">
        <div className="flex min-w-0 flex-col gap-2 sm:col-span-2 xl:w-[280px]">
          <Label htmlFor="planning-line-code-search">Buscar por código</Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="planning-line-code-search"
              type="search"
              value={codeInput}
              maxLength={20}
              placeholder="Ej. POA-001"
              className="pl-9 pr-10"
              onChange={(event) => setCodeInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && codeInput) clearCodeSearch();
              }}
            />
            {codeInput && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Limpiar búsqueda por código"
                className="absolute right-0 top-0 h-9 w-9"
                onClick={clearCodeSearch}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <Select
          value={fiscalYearId || "all"}
          onValueChange={(val) => updateFilter("fiscal_year_id", val)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Año fiscal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los años</SelectItem>
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
            <SelectValue placeholder="Unidad orgánica" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las unidades</SelectItem>
            {orgUnits.map((ou) => (
              <SelectItem key={ou.id} value={ou.id}>
                {getOrgUnitFilterLabel(ou)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={effectiveStatus ?? "all"}
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
      {isRefreshing && (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          Actualizando resultados por código...
        </p>
      )}
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 p-4"
        >
          <p className="text-sm text-destructive">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void refetch({ force: true })}
          >
            Reintentar
          </Button>
        </div>
      ) : isLoading ? (
        <div aria-busy="true">
          <p role="status" className="sr-only">
            Buscando líneas por código
          </p>
          <PlanningLinesTable lines={[]} isLoading onRefetch={refetch} />
        </div>
      ) : lines.length === 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"
        >
          <p>
            {effectiveCode
              ? `No se encontraron líneas con el código “${effectiveCode}”`
              : "No hay líneas para los filtros seleccionados"}
          </p>
        </div>
      ) : (
        <PlanningLinesTable
          lines={lines}
          isLoading={false}
          onRefetch={refetch}
        />
      )}

      {/* Paginacion */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Total: {total} lineas</p>
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
