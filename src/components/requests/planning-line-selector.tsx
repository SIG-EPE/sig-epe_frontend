import { Control } from "react-hook-form";

import { SearchSelectModal } from "@/components/ui/search-select-modal";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useRequestPlanningLines } from "@/hooks/use-requests";
import { formatRequestCurrency, getPlanningLineDisplay } from "@/lib/requests";
import type { RequestPlanningLineLookupItem } from "@/types/requests";
import type { RequestFormValues } from "./request-form";

interface PlanningLineSelectorProps {
  control: Control<RequestFormValues>;
  selectedLine?: RequestPlanningLineLookupItem | null;
  onSelectedLineChange: (line: RequestPlanningLineLookupItem | null) => void;
}

function getLineSubLabel(line: RequestPlanningLineLookupItem): string {
  const parts = [line.org_unit?.name, line.program?.name, formatRequestCurrency(line.total_cost)].filter(Boolean);
  return parts.join(" · ");
}

export function PlanningLineSelector({ control, selectedLine, onSelectedLineChange }: PlanningLineSelectorProps) {
  const { lines, isLoading, error } = useRequestPlanningLines();

  return (
    <FormField
      control={control}
      name="budget_planning_line_id"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Línea POA *</FormLabel>
          <FormControl>
            <SearchSelectModal
              value={field.value || null}
              placeholder={isLoading ? "Cargando líneas..." : "Seleccionar línea POA"}
              displayValue={selectedLine ? getPlanningLineDisplay(selectedLine) : undefined}
              title="Seleccionar línea POA aprobada"
              items={lines}
              getItemId={(line) => line.id}
              getItemLabel={(line) => getPlanningLineDisplay(line)}
              getItemSubLabel={getLineSubLabel}
              searchPlaceholder="Buscar por código, descripción o unidad..."
              testId="request-planning-line-trigger"
              onChange={(id) => {
                field.onChange(id ?? "");
                onSelectedLineChange(lines.find((line) => line.id === id) ?? null);
              }}
              disabled={isLoading}
              hasError={Boolean(error)}
            />
          </FormControl>
          {selectedLine && (
            <FormDescription>
              {selectedLine.org_unit?.code ? `${selectedLine.org_unit.code} · ` : ""}{selectedLine.org_unit?.name ?? "Sin unidad"}
            </FormDescription>
          )}
          {error && <p className="text-xs text-destructive">{error.message}</p>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
