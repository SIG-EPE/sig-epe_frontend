"use client";

import { useState } from "react";

import { useAuditLogs, type AuditLogsFilters } from "@/hooks/use-audit-logs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AuditLogsTable } from "./audit-logs-table";
import { AuditLogsFiltersPanel } from "./audit-logs-filters";

// -------------------------------------------------------
// Constants
// -------------------------------------------------------

const PAGE_SIZE = 50;

const DEFAULT_FILTERS: AuditLogsFilters = {
  page: 1,
  limit: PAGE_SIZE,
};

// -------------------------------------------------------
// Componente principal de la pagina de audit logs
// -------------------------------------------------------

export function AuditLogsPage() {
  const [filters, setFilters] = useState<AuditLogsFilters>(DEFAULT_FILTERS);

  const { logs, total, isLoading, error } = useAuditLogs(filters);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleFiltersChange = (partial: Partial<AuditLogsFilters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  };

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <span>Dashboard</span>
        <span>/</span>
        <span>Admin</span>
        <span>/</span>
        <span className="font-medium text-foreground">Registros de Auditoria</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Registros de Auditoria</h1>
        <p className="text-muted-foreground">
          Historial de operaciones registradas en el sistema SIG-EPE.{" "}
          {!isLoading && (
            <span className="text-sm">
              ({total} registro{total !== 1 ? "s" : ""} en total)
            </span>
          )}
        </p>
      </div>

      {/* Filtros */}
      <AuditLogsFiltersPanel
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onReset={handleReset}
      />

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Eventos registrados
            {filters.action || filters.userId || filters.dateFrom || filters.dateTo
              ? " (filtrados)"
              : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AuditLogsTable logs={logs} isLoading={isLoading} />

          {/* Paginacion */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Pagina {filters.page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleFiltersChange({ page: Math.max(1, filters.page - 1) })
                  }
                  disabled={filters.page <= 1 || isLoading}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleFiltersChange({
                      page: Math.min(totalPages, filters.page + 1),
                    })
                  }
                  disabled={filters.page >= totalPages || isLoading}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
