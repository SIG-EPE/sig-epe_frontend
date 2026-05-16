"use client";

// -------------------------------------------------------
// OrgUnitTreeSelect — Selector jerárquico de Unidades Orgánicas
// Muestra padre (nivel 0) e hijos indentados (nivel 1).
// Opcionalmente muestra el techo presupuestal disponible.
// -------------------------------------------------------

import type { OrganizationalUnit } from "@/types/catalogs";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

export interface OrgUnitTreeSelectProps {
  /** ID actualmente seleccionado */
  value: string | null | undefined;
  /** Callback al cambiar selección; recibe null cuando se deselecciona */
  onChange: (id: string | null) => void;
  /** Árbol de UOs obtenido desde useOrgUnitsTree() */
  units: OrganizationalUnit[] | null | undefined;
  /** Muestra el techo presupuestal junto al nombre */
  showBudgetCeiling?: boolean;
  /** ID del elemento a excluir (útil para evitar auto-referencia en edit) */
  excludeId?: string;
  disabled?: boolean;
  hasError?: boolean;
  placeholder?: string;
}

function formatLabel(unit: OrganizationalUnit, showBudgetCeiling: boolean): string {
  const ceiling =
    showBudgetCeiling && unit.budgetCeiling != null
      ? ` — Techo: S/ ${unit.budgetCeiling.toLocaleString("es-PE")}`
      : "";
  return `${unit.name}${ceiling}`;
}

export function OrgUnitTreeSelect({
  value,
  onChange,
  units,
  showBudgetCeiling = false,
  excludeId,
  disabled = false,
  hasError = false,
  placeholder = "Seleccionar unidad orgánica...",
}: OrgUnitTreeSelectProps) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className={`${SELECT_CLASS} ${hasError ? "border-destructive" : ""}`}
    >
      <option value="">{placeholder}</option>

      {units
        ?.filter((unit) => unit.id !== excludeId)
        .map((unit) => (
          <optgroup key={unit.id} label={formatLabel(unit, showBudgetCeiling)}>
            {/* Opción para la propia UO padre */}
            <option value={unit.id}>{formatLabel(unit, showBudgetCeiling)}</option>

            {/* Hijos nivel 1 */}
            {unit.children
              ?.filter((child) => child.id !== excludeId)
              .map((child) => (
                <option key={child.id} value={child.id}>
                  {"\u00A0\u00A0\u00A0\u00A0"}↳ {formatLabel(child, showBudgetCeiling)}
                </option>
              ))}
          </optgroup>
        ))}
    </select>
  );
}
