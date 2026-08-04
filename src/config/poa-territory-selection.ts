export interface PoaTerritorySelectionFeatures {
  writeEnabled: boolean;
  readEnabled: boolean;
  importEnabled: boolean;
  reportsEnabled: boolean;
}

export function getPoaTerritorySelectionFeatures(): PoaTerritorySelectionFeatures {
  return {
    writeEnabled: process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_WRITE_ENABLED === "true",
    readEnabled: process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_READ_ENABLED === "true",
    importEnabled: process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_IMPORT_ENABLED === "true",
    reportsEnabled: process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_REPORTS_ENABLED === "true",
  };
}

export function resolvePoaTerritorySelectionRead<TStructured, TAnchor>(
  structured: TStructured | null | undefined,
  legacyAnchor: TAnchor | null,
):
  | { source: "STRUCTURED"; value: TStructured }
  | { source: "LEGACY_ANCHOR"; value: TAnchor | null } {
  if (getPoaTerritorySelectionFeatures().readEnabled && structured != null) {
    return { source: "STRUCTURED", value: structured };
  }

  return { source: "LEGACY_ANCHOR", value: legacyAnchor };
}
