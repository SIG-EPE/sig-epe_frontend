"use client";

import { Label } from "@/components/ui/label";
import { useTerritories } from "@/hooks/use-budget";
import {
  TERRITORY_AGGREGATE_OPTIONS,
  TERRITORY_SELECTION_AXES,
  type TerritoryAxisDraft,
} from "@/lib/poa-territory-selection";
import type { PlanningLineTerritoryAxisInput, TerritorySelectionAxis } from "@/types/budget";

const EMPTY_VALUE = "";
const SELECT_CLASS =
  "flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

const AXIS_LABELS: Record<TerritorySelectionAxis, string> = {
  REGION: "Región",
  PROVINCIA: "Provincia",
  DISTRITO: "Distrito",
};

interface StructuredTerritorySelectorProps {
  value: TerritoryAxisDraft;
  onChange: (value: TerritoryAxisDraft) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
}

function encodeSelection(selection: PlanningLineTerritoryAxisInput | undefined): string {
  if (selection?.territory_id) return `territory:${selection.territory_id}`;
  if (selection?.aggregate_option_id) return `aggregate:${selection.aggregate_option_id}`;
  return EMPTY_VALUE;
}

function decodeSelection(axis: TerritorySelectionAxis, value: string): PlanningLineTerritoryAxisInput | undefined {
  const [kind, id] = value.split(":", 2);
  if (!id) return undefined;
  return kind === "territory"
    ? { axis, territory_id: id }
    : { axis, aggregate_option_id: id };
}

export function StructuredTerritorySelector({
  value,
  onChange,
  disabled = false,
  required = true,
  error,
}: StructuredTerritorySelectorProps) {
  const { data: territories, isLoading, error: loadError } = useTerritories();
  const active = (territories ?? []).filter((territory) => territory.is_active);
  const selectedRegionId = value.REGION?.territory_id;
  const selectedProvinceId = value.PROVINCIA?.territory_id;

  const optionsByAxis = {
    REGION: active.filter((territory) => territory.level === "REGION"),
    PROVINCIA: active.filter(
      (territory) => territory.level === "PROVINCIA"
        && (!selectedRegionId || territory.parent_id === selectedRegionId),
    ),
    DISTRITO: active.filter(
      (territory) => territory.level === "DISTRITO"
        && (!selectedProvinceId || territory.parent_id === selectedProvinceId),
    ),
  };

  function handleChange(axis: TerritorySelectionAxis, rawValue: string) {
    const next: TerritoryAxisDraft = { ...value, [axis]: decodeSelection(axis, rawValue) };
    if (axis === "REGION") {
      const region = decodeSelection(axis, rawValue);
      if (region?.territory_id && value.PROVINCIA?.territory_id) {
        const province = active.find((item) => item.id === value.PROVINCIA?.territory_id);
        if (province?.parent_id !== region.territory_id) {
          delete next.PROVINCIA;
          delete next.DISTRITO;
        }
      }
    }
    if (axis === "PROVINCIA") {
      const province = decodeSelection(axis, rawValue);
      if (province?.territory_id && value.DISTRITO?.territory_id) {
        const district = active.find((item) => item.id === value.DISTRITO?.territory_id);
        if (district?.parent_id !== province.territory_id) delete next.DISTRITO;
      }
    }
    onChange(next);
  }

  return (
    <fieldset className="space-y-3" aria-describedby={error ? "structured-territory-error" : undefined}>
      <legend className="text-sm font-medium">
        Alcance territorial por eje
        {required && <span className="ml-1 text-destructive" aria-hidden="true">*</span>}
      </legend>
      <p className="text-xs text-muted-foreground">
        Elige un territorio oficial o el alcance agregado correspondiente en cada eje.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TERRITORY_SELECTION_AXES.map((axis) => {
          const aggregate = TERRITORY_AGGREGATE_OPTIONS[axis];
          const id = `structured-territory-${axis.toLocaleLowerCase("es-PE")}`;
          return (
            <div className="space-y-1.5" key={axis}>
              <Label htmlFor={id}>{AXIS_LABELS[axis]}</Label>
              <select
                id={id}
                value={encodeSelection(value[axis])}
                onChange={(event) => handleChange(axis, event.target.value)}
                disabled={disabled || isLoading}
                required={required}
                aria-invalid={Boolean(error)}
                className={SELECT_CLASS}
              >
                <option value="">Seleccionar {AXIS_LABELS[axis].toLocaleLowerCase("es-PE")}...</option>
                <optgroup label="Alcance agregado">
                  <option value={`aggregate:${aggregate.id}`}>{aggregate.name}</option>
                </optgroup>
                <optgroup label="Territorios oficiales">
                  {optionsByAxis[axis].map((territory) => (
                    <option key={territory.id} value={`territory:${territory.id}`}>
                      {territory.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          );
        })}
      </div>
      {loadError && <p role="alert" className="text-sm text-destructive">No se pudieron cargar los territorios. Intenta nuevamente.</p>}
      {error && <p id="structured-territory-error" role="alert" className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}
