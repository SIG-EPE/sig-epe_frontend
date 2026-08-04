import { afterEach, describe, expect, it } from "vitest";

import {
  getPoaTerritorySelectionFeatures,
  resolvePoaTerritorySelectionRead,
} from "../poa-territory-selection";

const keys = [
  "NEXT_PUBLIC_POA_TERRITORY_SELECTION_WRITE_ENABLED",
  "NEXT_PUBLIC_POA_TERRITORY_SELECTION_READ_ENABLED",
  "NEXT_PUBLIC_POA_TERRITORY_SELECTION_IMPORT_ENABLED",
  "NEXT_PUBLIC_POA_TERRITORY_SELECTION_REPORTS_ENABLED",
] as const;
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("POA territory selection rollout gates", () => {
  it("defaults every frontend gate off", () => {
    for (const key of keys) delete process.env[key];

    expect(getPoaTerritorySelectionFeatures()).toEqual({
      writeEnabled: false,
      readEnabled: false,
      importEnabled: false,
      reportsEnabled: false,
    });
  });

  it("enables gates independently and only for literal true", () => {
    process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_WRITE_ENABLED = "true";
    process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_READ_ENABLED = "TRUE";
    process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_IMPORT_ENABLED = "1";
    process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_REPORTS_ENABLED = "true";

    expect(getPoaTerritorySelectionFeatures()).toEqual({
      writeEnabled: true,
      readEnabled: false,
      importEnabled: false,
      reportsEnabled: true,
    });
  });

  it("keeps legacy UI data flags-off and provides structured-first anchor fallback flags-on", () => {
    delete process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_READ_ENABLED;
    expect(resolvePoaTerritorySelectionRead("structured", "anchor")).toEqual({
      source: "LEGACY_ANCHOR",
      value: "anchor",
    });

    process.env.NEXT_PUBLIC_POA_TERRITORY_SELECTION_READ_ENABLED = "true";
    expect(resolvePoaTerritorySelectionRead("structured", "anchor")).toEqual({
      source: "STRUCTURED",
      value: "structured",
    });
    expect(resolvePoaTerritorySelectionRead(null, "anchor")).toEqual({
      source: "LEGACY_ANCHOR",
      value: "anchor",
    });
  });
});
