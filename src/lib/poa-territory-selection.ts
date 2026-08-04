import type { PlanningLineTerritoryAxisInput, TerritorySelectionAxis } from "@/types/budget";

export const TERRITORY_SELECTION_AXIS = {
  REGION: "REGION",
  PROVINCIA: "PROVINCIA",
  DISTRITO: "DISTRITO",
} as const;

export const TERRITORY_SELECTION_AXES = [
  TERRITORY_SELECTION_AXIS.REGION,
  TERRITORY_SELECTION_AXIS.PROVINCIA,
  TERRITORY_SELECTION_AXIS.DISTRITO,
] as const;

export const TERRITORY_AGGREGATE_OPTIONS = {
  REGION: {
    id: "75f8f352-9d76-4c32-8b01-000000000001",
    code: "MULTIREGIONAL",
    axis: TERRITORY_SELECTION_AXIS.REGION,
    name: "Multiregional",
  },
  PROVINCIA: {
    id: "75f8f352-9d76-4c32-8b01-000000000002",
    code: "MULTIPROVINCIAL",
    axis: TERRITORY_SELECTION_AXIS.PROVINCIA,
    name: "Multiprovincial",
  },
  DISTRITO: {
    id: "75f8f352-9d76-4c32-8b01-000000000003",
    code: "MULTIDISTRITAL",
    axis: TERRITORY_SELECTION_AXIS.DISTRITO,
    name: "Multidistrital",
  },
} as const;

export type TerritoryAxisDraft = Partial<Record<TerritorySelectionAxis, PlanningLineTerritoryAxisInput>>;

export function buildTerritorySelectionPayload(
  draft: TerritoryAxisDraft,
): { axes: PlanningLineTerritoryAxisInput[] } | null {
  const axes = TERRITORY_SELECTION_AXES.map((axis) => draft[axis]);
  if (axes.some((selection) => !selection)) return null;
  return { axes: axes as PlanningLineTerritoryAxisInput[] };
}

export function isUnclassifiedLabel(value: string | null | undefined): boolean {
  return value?.trim().toLocaleUpperCase("es-PE").includes("POR CLASIFICAR") ?? false;
}
