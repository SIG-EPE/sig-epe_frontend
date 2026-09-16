import { describe, expect, it } from "vitest";
import { canPreviewPenBudget, validatePoaCurrencies } from "@/lib/request-currency-policy";

describe("request currency policy", () => {
  it.each([
    ["PEN", ["PEN"], true], ["USD", ["PEN", "PEN"], true],
    ["USD", ["USD"], true], ["PEN", ["USD"], false],
    ["USD", ["USD", "PEN"], false], ["PEN", [null], false],
    [null, ["PEN"], false], ["USD", [undefined], false],
  ])("validates %s against %j", (currency, lines, valid) => {
    expect(validatePoaCurrencies(currency, lines) === null).toBe(valid);
  });
  it("never previews USD, unresolved or empty selections as PEN", () => {
    expect(canPreviewPenBudget("PEN", ["PEN"])).toBe(true);
    for (const currency of ["USD", null, undefined]) {
      expect(canPreviewPenBudget(currency, ["PEN"])).toBe(false);
    }
    expect(canPreviewPenBudget("PEN", [])).toBe(false);
    expect(canPreviewPenBudget("PEN", [undefined])).toBe(false);
  });
});
