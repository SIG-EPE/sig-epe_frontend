import { describe, expect, it } from "vitest";

import {
  formatExactMoney,
  multiplyMoneyByRateHalfUp,
} from "@/lib/payment-fx";

describe("payment FX exact decimal helpers", () => {
  it("rounds the PEN preview half-up without JavaScript floating point", () => {
    expect(multiplyMoneyByRateHalfUp("1.00", "3.805")).toBe("3.81");
    expect(multiplyMoneyByRateHalfUp("90071992547409.91", "3.805")).toBe(
      "342723931642894.71",
    );
  });

  it("keeps exact original money strings for display", () => {
    expect(formatExactMoney("1000.50", "USD")).toBe("USD 1,000.50");
    expect(formatExactMoney("90071992547409.91", "PEN")).toBe(
      "PEN 90,071,992,547,409.91",
    );
  });

  it("rejects invalid, zero and over-precision rates", () => {
    expect(() => multiplyMoneyByRateHalfUp("1.00", "0")).toThrow();
    expect(() => multiplyMoneyByRateHalfUp("1.00", "3.1234567890123")).toThrow();
    expect(() => multiplyMoneyByRateHalfUp("1.00", "3e2")).toThrow();
  });
});
