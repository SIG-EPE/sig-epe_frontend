"use client";

// -------------------------------------------------------
// BalanceFilters — Filtros para el dashboard de balance
// Ano fiscal, unidad organica, territorio, tipo de presupuesto
// -------------------------------------------------------

import { useBudgetBalanceStore } from "@/stores/budget-balance-store";
import { useFiscalYears } from "@/hooks/use-budget";
import { useOrganizationalUnits } from "@/hooks/use-budget";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TerritorySelector } from "@/components/shared/territory-selector";
import { X } from "lucide-react";

// -------------------------------------------------------
// Select envolvido em componente controlado pelo Zustand
// -------------------------------------------------------

function FiscalYearSelect() {
  const fiscalYearId = useBudgetBalanceStore((s) => s.fiscalYearId);
  const setFiscalYearId = useBudgetBalanceStore((s) => s.setFiscalYearId);
  const { data: fiscalYears, isLoading } = useFiscalYears();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="fiscal-year">Ano Fiscal</Label>
      <Select
        value={fiscalYearId ?? ""}
        onValueChange={(value) => setFiscalYearId(value)}
        disabled={isLoading}
      >
        <SelectTrigger id="fiscal-year" className="w-full">
          <SelectValue placeholder="Seleccionar ano fiscal" />
        </SelectTrigger>
        <SelectContent>
          {fiscalYears?.map((fy) => (
            <SelectItem key={fy.id} value={fy.id}>
              {fy.year} — {fy.status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function OrgUnitSelect() {
  const filters = useBudgetBalanceStore((s) => s.filters);
  const setFilter = useBudgetBalanceStore((s) => s.setFilter);
  const { data: orgUnits, isLoading } = useOrganizationalUnits();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="org-unit">Unidad Organica</Label>
      <Select
        value={filters.org_unit_id ?? ""}
        onValueChange={(value) => setFilter("org_unit_id", value)}
        disabled={isLoading}
      >
        <SelectTrigger id="org-unit" className="w-full">
          <SelectValue placeholder="Todas las unidades" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todas las unidades</SelectItem>
          {orgUnits?.map((unit) => (
            <SelectItem key={unit.id} value={unit.id}>
              {unit.code} — {unit.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TerritorySelectCascade() {
  const filters = useBudgetBalanceStore((s) => s.filters);
  const setFilter = useBudgetBalanceStore((s) => s.setFilter);

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium">Territorio</Label>
      <TerritorySelector
        value={filters.territory_id || undefined}
        onChange={(val) => setFilter("territory_id", val ?? "")}
        mode="filter"
        showLabel={false}
        className="col-span-full"
      />
    </div>
  );
}

// -------------------------------------------------------
// Componente principal
// -------------------------------------------------------

export function BalanceFilters() {
  const clearFilters = useBudgetBalanceStore((s) => s.clearFilters);
  const filters = useBudgetBalanceStore((s) => s.filters);
  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Fila de filtros */}
      <div className="flex flex-col gap-4">
        {/* Primera fila: ano fiscal, unidad organica */}
        <div className="grid gap-4 sm:grid-cols-2">
          <FiscalYearSelect />
          <OrgUnitSelect />
        </div>
        {/* Segunda fila: selector de territorio en cascada */}
        <TerritorySelectCascade />
      </div>

      {/* Boton limpiar */}
      {hasActiveFilters && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={clearFilters}
            className="gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
