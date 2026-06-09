import { describe, expect, it } from "vitest";

import { PLANNING_TYPE, PLANNING_TYPE_LABELS, PLANNING_TYPES } from "@/lib/planning-types";

describe("planning types", () => {
  it("uses backend enum values and Spanish display labels", () => {
    expect(PLANNING_TYPES).toEqual(["PROGRAMA", "PROYECTO", "GESTION"]);
    expect(PLANNING_TYPE.GESTION).toBe("GESTION");
    expect(PLANNING_TYPE_LABELS.GESTION).toBe("Gestión");
  });
});
