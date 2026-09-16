import { describe, expect, it } from "vitest";
import { requestMoneyError, requestMoneyInput, requestMoneyTotal } from "../request-form-money";

describe("request form exact money", () => {
  it("distinguishes blank, zero, precision and range", () => {
    expect(requestMoneyError("")).toBe("Ingresa el monto de la línea POA.");
    expect(requestMoneyError("0")).toContain("mayor a cero");
    expect(requestMoneyError("1.000")).toContain("dos decimales");
    expect(requestMoneyError("10000000000")).toContain("9999999999.99");
    expect(requestMoneyError("9999999999.99")).toBeNull();
    expect(requestMoneyError(0.1)).toContain("cadena decimal");
  });
  it("hydrates null as blank, zero as zero and strings without numeric conversion", () => {
    expect(requestMoneyInput(null)).toBe("");
    expect(requestMoneyInput(undefined)).toBe("");
    expect(requestMoneyInput(0)).toBe("0");
    expect(requestMoneyInput("9999999999999999.99")).toBe("9999999999999999.99");
  });
  it("enforces the distinct request range and sums exact cents", () => {
    expect(requestMoneyError("9999999999999999.99", 16, true)).toBeNull();
    expect(requestMoneyError("10000000000000000", 16, true)).not.toBeNull();
    expect(requestMoneyTotal(["9999999999.99", "0.01"])).toBe("10000000000.00");
    expect(requestMoneyTotal(["0.1", "0.2"])).toBe("0.30");
    expect(() => requestMoneyTotal(["", "1"])).toThrow();
    expect(() => requestMoneyTotal([0.1, "0.20"])).toThrow();
  });
});
