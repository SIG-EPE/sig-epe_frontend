import { useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuditLogsFilters } from "@/hooks/use-audit-logs";

// -------------------------------------------------------
// Props
// -------------------------------------------------------

interface AuditLogsFiltersProps {
  filters: AuditLogsFilters;
  onFiltersChange: (filters: Partial<AuditLogsFilters>) => void;
  onReset: () => void;
}

// -------------------------------------------------------
// Componente
// -------------------------------------------------------

export function AuditLogsFiltersPanel({
  filters,
  onFiltersChange,
  onReset,
}: AuditLogsFiltersProps) {
  // Estado local para evitar refetch en cada keystroke
  const [localAction, setLocalAction] = useState(filters.action ?? "");
  const [localUserId, setLocalUserId] = useState(filters.userId ?? "");

  const handleSearch = () => {
    onFiltersChange({
      action: localAction.trim() || undefined,
      userId: localUserId.trim() || undefined,
      page: 1,
    });
  };

  const handleReset = () => {
    setLocalAction("");
    setLocalUserId("");
    onReset();
  };

  const hasActiveFilters =
    !!filters.action ||
    !!filters.userId ||
    !!filters.dateFrom ||
    !!filters.dateTo;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Acción */}
        <div className="space-y-1.5">
          <Label htmlFor="filter-action" className="text-xs font-medium">
            Acción / Ruta
          </Label>
          <Input
            id="filter-action"
            placeholder="Ej: creación de usuario"
            value={localAction}
            onChange={(e) => setLocalAction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>

        {/* ID de usuario */}
        <div className="space-y-1.5">
          <Label htmlFor="filter-user" className="text-xs font-medium">
            UUID de usuario
          </Label>
          <Input
            id="filter-user"
            placeholder="Ej: 3fa85f64-..."
            value={localUserId}
            onChange={(e) => setLocalUserId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>

        {/* Desde */}
        <div className="space-y-1.5">
          <Label htmlFor="filter-date-from" className="text-xs font-medium">
            Desde
          </Label>
          <Input
            id="filter-date-from"
            type="date"
            value={filters.dateFrom ?? ""}
            onChange={(e) =>
              onFiltersChange({ dateFrom: e.target.value || undefined, page: 1 })
            }
          />
        </div>

        {/* Hasta */}
        <div className="space-y-1.5">
          <Label htmlFor="filter-date-to" className="text-xs font-medium">
            Hasta
          </Label>
          <Input
            id="filter-date-to"
            type="date"
            value={filters.dateTo ?? ""}
            onChange={(e) =>
              onFiltersChange({ dateTo: e.target.value || undefined, page: 1 })
            }
          />
        </div>
      </div>

      {/* Acciones */}
      <div className="mt-4 flex items-center gap-2">
        <Button size="sm" onClick={handleSearch}>
          <Search className="mr-2 h-3.5 w-3.5" />
          Buscar
        </Button>
        {hasActiveFilters && (
          <Button size="sm" variant="ghost" onClick={handleReset}>
            <X className="mr-2 h-3.5 w-3.5" />
            Limpiar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
