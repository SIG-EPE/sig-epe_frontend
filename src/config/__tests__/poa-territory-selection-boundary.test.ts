import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("POA territory visual boundary", () => {
  it("keeps the legacy selector free of V2 aggregate and rollout behavior", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/shared/territory-selector.tsx"),
      "utf8",
    );

    expect(source).not.toContain("config/poa-territory-selection");
    expect(source).not.toContain("TERRITORY_AGGREGATE_OPTIONS");
  });

  it("wires structured creation only through the guarded planning form", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/budget/planning/new-planning-line-form.tsx"),
      "utf8",
    );
    expect(source).toContain("getPoaTerritorySelectionFeatures().writeEnabled");
    expect(source).toContain("territory_selection: territorySelection");
    expect(source).toContain("territory_id: parsed.data.territory_id");
  });
});
