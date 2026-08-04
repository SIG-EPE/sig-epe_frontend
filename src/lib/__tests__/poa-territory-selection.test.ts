import { describe, expect, it } from "vitest";

import {
  TERRITORY_AGGREGATE_OPTIONS,
  buildTerritorySelectionPayload,
  isUnclassifiedLabel,
} from "../poa-territory-selection";

describe("POA structured territory contract", () => {
  it("builds exactly three ordered axes without a legacy anchor", () => {
    expect(buildTerritorySelectionPayload({
      REGION: { axis: "REGION", territory_id: "region" },
      PROVINCIA: {
        axis: "PROVINCIA",
        aggregate_option_id: TERRITORY_AGGREGATE_OPTIONS.PROVINCIA.id,
      },
      DISTRITO: { axis: "DISTRITO", territory_id: "district" },
    })).toEqual({
      axes: [
        { axis: "REGION", territory_id: "region" },
        {
          axis: "PROVINCIA",
          aggregate_option_id: "75f8f352-9d76-4c32-8b01-000000000002",
        },
        { axis: "DISTRITO", territory_id: "district" },
      ],
    });
  });

  it("rejects an incomplete selection and identifies unclassified labels", () => {
    expect(buildTerritorySelectionPayload({
      REGION: { axis: "REGION", territory_id: "region" },
    })).toBeNull();
    expect(isUnclassifiedLabel("00 · POR CLASIFICAR")).toBe(true);
    expect(isUnclassifiedLabel("Materiales")).toBe(false);
  });
});
