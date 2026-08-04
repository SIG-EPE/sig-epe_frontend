import { describe, expect, it } from "vitest";

import { moneyDecimalToNumber, sumMoneyDecimals } from "../money-decimal";

describe("money decimal presentation boundary", () => {
  it("keeps exact API sums until converting once for presentation", () => {
    expect(150000.4 + 5060.02).toBe(155060.41999999998);
    expect(sumMoneyDecimals(["150000.40", "5060.02"])).toBe("155060.42");
    expect(sumMoneyDecimals(["155060.419999", "946521.810002"])).toBe("1101582.230001");
    expect(moneyDecimalToNumber("155060.42", 155060.41999999998)).toBe(155060.42);
  });
});
