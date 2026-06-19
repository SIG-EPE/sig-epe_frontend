import { describe, expect, it } from "vitest";

import {
  getOrgUnitPoaPrefix,
  hasValidOrgUnitPoaPrefix,
  isValidPoaPrefix,
  normalizeOptionalPoaPrefix,
} from "../poa-prefix";

describe("poa-prefix", () => {
  it("normaliza prefijos válidos con trim y mayúsculas", () => {
    expect(normalizeOptionalPoaPrefix(" mel ")).toBe("MEL");
    expect(isValidPoaPrefix("mel2026")).toBe(true);
  });

  it("rechaza espacios, guiones y símbolos", () => {
    expect(isValidPoaPrefix("TEST UO")).toBe(false);
    expect(isValidPoaPrefix("MEL-POA")).toBe(false);
    expect(isValidPoaPrefix("GIOF_1")).toBe(false);
  });

  it("usa short_name antes que code para validar unidades orgánicas", () => {
    expect(getOrgUnitPoaPrefix({ code: "OU", short_name: "mel" })).toBe("MEL");
    expect(hasValidOrgUnitPoaPrefix({ code: "OU", short_name: "TEST UO" })).toBe(false);
    expect(hasValidOrgUnitPoaPrefix({ code: "ou", short_name: null })).toBe(true);
  });
});
