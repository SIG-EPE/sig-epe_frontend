"use client";

import { useState } from "react";
import { toast } from "sonner";

import { StructuredTerritorySelector } from "@/components/shared/structured-territory-selector";
import { Button } from "@/components/ui/button";
import { useUpdatePlanningLineTerritory } from "@/hooks/use-budget";
import {
  TERRITORY_SELECTION_AXES,
  buildTerritorySelectionPayload,
  type TerritoryAxisDraft,
} from "@/lib/poa-territory-selection";
import type { PlanningLineTerritorySelection } from "@/types/budget";

interface PlanningLineTerritoryCardProps {
  lineId: string;
  selection?: PlanningLineTerritorySelection;
  legacyLabel: string;
  canEdit: boolean;
  onUpdated?: () => void | Promise<void>;
}

function toDraft(selection: PlanningLineTerritorySelection | undefined): TerritoryAxisDraft {
  return Object.fromEntries((selection?.axes ?? []).map((axis) => [
    axis.axis,
    axis.territory_id
      ? { axis: axis.axis, territory_id: axis.territory_id }
      : { axis: axis.axis, aggregate_option_id: axis.aggregate_option_id ?? undefined },
  ]));
}

export function PlanningLineTerritoryCard({
  lineId,
  selection,
  legacyLabel,
  canEdit,
  onUpdated,
}: PlanningLineTerritoryCardProps) {
  const { update, isLoading } = useUpdatePlanningLineTerritory(lineId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TerritoryAxisDraft>(() => toDraft(selection));
  const [error, setError] = useState<string>();

  async function handleSave() {
    const payload = buildTerritorySelectionPayload(draft);
    if (!payload) {
      setError("Selecciona un territorio oficial o agregado en cada uno de los tres ejes.");
      return;
    }
    try {
      await update(payload);
      toast.success("Territorio reclasificado");
      setEditing(false);
      await onUpdated?.();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo reclasificar el territorio";
      setError(message);
      toast.error(message);
    }
  }

  if (editing) {
    return (
      <div className="space-y-4 rounded-lg border bg-card p-4">
        <StructuredTerritorySelector
          value={draft}
          onChange={(value) => {
            setDraft(value);
            setError(undefined);
          }}
          disabled={isLoading}
          error={error}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Guardando..." : "Guardar reclasificación"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Alcance territorial</p>
          {selection?.axes.length === 3 ? (
            <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {TERRITORY_SELECTION_AXES.map((axis) => {
                const item = selection.axes.find((candidate) => candidate.axis === axis);
                return (
                  <div key={axis}>
                    <dt className="text-xs text-muted-foreground">{axis === "REGION" ? "Región" : axis === "PROVINCIA" ? "Provincia" : "Distrito"}</dt>
                    <dd className="text-sm font-medium">
                      {item?.territory?.name ?? item?.aggregate_option?.name ?? "-"}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : (
            <p className="mt-1 text-sm font-medium">{legacyLabel || "-"}</p>
          )}
        </div>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            Reclasificar territorio
          </Button>
        )}
      </div>
    </div>
  );
}
