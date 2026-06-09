import { describe, expect, it } from "vitest";

import { normalizeDecimalInput, parseDecimalInput } from "@/lib/numeric-input";

describe("normalizeDecimalInput", () => {
  it("removes leading zeroes from integer values", () => {
    expect(normalizeDecimalInput("0123")).toBe("123");
    expect(normalizeDecimalInput("032")).toBe("32");
    expect(normalizeDecimalInput("000")).toBe("0");
  });

  it("preserves decimal entry while normalizing the integer part", () => {
    expect(normalizeDecimalInput("000.50")).toBe("0.50");
    expect(normalizeDecimalInput("0123.45")).toBe("123.45");
    expect(normalizeDecimalInput("0.")).toBe("0.");
  });

  it("allows clearing the field while editing", () => {
    expect(normalizeDecimalInput("")).toBe("");
    expect(parseDecimalInput("")).toBeUndefined();
  });
});
