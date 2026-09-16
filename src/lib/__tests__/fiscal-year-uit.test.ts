import { describe, expect, it } from "vitest";
import { annualUitInputSchema, formatAnnualUit, draftUitChange } from "@/lib/fiscal-year-uit";

describe("annual UIT exact input contract", () => {
  it.each(["0.01", "5500", "5500.1", "9999999999.99"])("accepts %s without rounding", (value) => {
    expect(annualUitInputSchema.parse(value)).toBe(value);
  });
  it.each(["0", "0.00", "-1", "1.001", "1e3", "1,50", "NaN", "Infinity", "10000000000", " ", "", null])("rejects %s", (value) => {
    expect(annualUitInputSchema.safeParse(value).success).toBe(false);
  });
  it("omits blank/unchanged updates and never emits null", () => {
    expect(draftUitChange("", "5500.00")).toEqual({});
    expect(draftUitChange("5500", "5500.00")).toEqual({});
    expect(draftUitChange("5500.01", null)).toEqual({ annual_uit: 5500.01 });
  });
  it("distinguishes missing, zero and exact two-decimal values", () => {
    expect(formatAnnualUit(null)).toBe("Sin configurar");
    expect(formatAnnualUit("0.00")).toBe("PEN 0.00 (inválido)");
    expect(formatAnnualUit("5500.00")).toBe("PEN 5500.00");
  });
});
