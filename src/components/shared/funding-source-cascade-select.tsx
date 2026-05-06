"use client";

import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useFundingSourceTypes, useCatalogFundingSources } from "@/hooks/use-catalogs";

// -------------------------------------------------------
// FundingSourceCascadeSelect
// Selector en cascada: Tipo de Fuente → Nombre de Fuente
// -------------------------------------------------------

interface FundingSourceCascadeSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
  showAmounts?: boolean;
  availableBalances?: Record<string, number>;
  disabled?: boolean;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(amount);
}

export function FundingSourceCascadeSelect({
  value,
  onChange,
  showAmounts = false,
  availableBalances = {},
  disabled = false,
}: FundingSourceCascadeSelectProps) {
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  const { data: types, isLoading: typesLoading } = useFundingSourceTypes();
  const { data: allSources, isLoading: sourcesLoading } = useCatalogFundingSources();

  // Filtrar fuentes activas por tipo seleccionado
  const filteredSources = useMemo(() => {
    if (!allSources) return [];
    if (!selectedTypeId) return [];
    return allSources.filter(
      (s) => s.is_active && s.fundingSourceType?.id === selectedTypeId,
    );
  }, [allSources, selectedTypeId]);

  function handleTypeChange(typeId: string) {
    setSelectedTypeId(typeId);
    // Resetear la fuente seleccionada al cambiar de tipo
    onChange(null);
  }

  function handleSourceChange(sourceId: string) {
    onChange(sourceId === "__none__" ? null : sourceId);
  }

  const isDisabled = disabled || typesLoading || sourcesLoading;

  return (
    <div className="flex flex-col gap-3">
      {/* Select Tipo */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-sm font-medium">Tipo de Fuente</Label>
        <Select
          value={selectedTypeId ?? ""}
          onValueChange={handleTypeChange}
          disabled={isDisabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar tipo..." />
          </SelectTrigger>
          <SelectContent>
            {(types ?? []).map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Select Nombre — solo visible si hay tipo seleccionado */}
      {selectedTypeId && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-sm font-medium">Nombre de Fuente</Label>
          <Select
            value={value ?? ""}
            onValueChange={handleSourceChange}
            disabled={isDisabled || filteredSources.length === 0}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  filteredSources.length === 0
                    ? "Sin fuentes disponibles para este tipo"
                    : "Seleccionar fuente..."
                }
              />
            </SelectTrigger>
            <SelectContent>
              {filteredSources.map((source) => {
                const balance = availableBalances[source.id];
                const label =
                  showAmounts && balance !== undefined
                    ? `${source.name} — ${formatCurrency(balance)} disponible`
                    : source.name;
                return (
                  <SelectItem key={source.id} value={source.id}>
                    {label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
