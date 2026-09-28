import { describe, expect, it } from "vitest";
import {
  buildApprovedAmendment,
  seedApprovedAmendment,
} from "../approved-amendment";
import type { PlanningLine } from "@/types/budget";

const line = {
  id: "line-1",
  status: "APPROVED",
  resource_id: null,
  resource_description: "Recurso libre",
  unit_price: 100,
  quantity: 1,
  unit_price_decimal: "100.00",
  quantity_decimal: "1.00",
  importance: "Actividad estratégica",
  frequency: "Actividad Rutinaria",
  monthlyDistribution: Array.from({ length: 12 }, (_, i) => ({
    id: `m${i}`,
    planning_line_id: "line-1",
    month: i + 1,
    planned_amount: i ? 0 : 100,
    executed_amount: 0,
    monthly_programmed_decimal: i ? "0.00" : "100.00",
  })),
} as PlanningLine;

describe("approved amendment exact input", () => {
  it("seeds only from a complete exact month projection", () => {
    expect(seedApprovedAmendment(line)?.monthly).toHaveLength(12);
    expect(
      seedApprovedAmendment({
        ...line,
        monthlyDistribution: line.monthlyDistribution?.slice(1),
      }),
    ).toBeNull();
    expect(
      seedApprovedAmendment({
        ...line,
        monthlyDistribution: line.monthlyDistribution?.map((m, i) =>
          i === 1 ? { ...m, monthly_programmed_decimal: undefined } : m,
        ),
      }),
    ).toBeNull();
    expect(
      seedApprovedAmendment({ ...line, unit_price: 999999999999.99 }),
    ).toMatchObject({ unit_price: "100.00" });
  });

  it("uses validated DB text only, including PostgreSQL numeric strings and large exact cents", () => {
    const exact = {
      ...line,
      unit_price: "9999999999.99",
      quantity: "1.00",
      unit_price_decimal: "9999999999.99",
      quantity_decimal: "1.00",
      monthlyDistribution: line.monthlyDistribution?.map((month, index) => ({
        ...month,
        monthly_programmed_decimal: index ? "0.00" : "9999999999.99",
      })),
    };
    const seed = seedApprovedAmendment(exact)!;
    expect(seed).toMatchObject({
      unit_price: "9999999999.99",
      quantity: "1.00",
    });
    expect(buildApprovedAmendment(seed, "4", false).request).toMatchObject({
      unit_price: "9999999999.99",
      quantity: "1.00",
      monthly: expect.arrayContaining([
        { month: 1, planned_amount: "9999999999.99" },
      ]),
    });
    expect(
      seedApprovedAmendment({ ...exact, unit_price_decimal: undefined }),
    ).toBeNull();
    expect(
      seedApprovedAmendment({ ...exact, quantity_decimal: "1e0" }),
    ).toBeNull();
    expect(
      seedApprovedAmendment({ ...exact, unit_price_decimal: "99999999999.99" }),
    ).toBeNull();
  });

  it("never substitutes aggregates or rounded JS numbers for missing authoritative months", () => {
    expect(
      seedApprovedAmendment({ ...line, monthlyDistribution: undefined }),
    ).toBeNull();
    expect(
      seedApprovedAmendment({ ...line, monthlyDistribution: [] }),
    ).toBeNull();
    expect(
      seedApprovedAmendment({ ...line, unit_price_decimal: undefined }),
    ).toBeNull();
    expect(
      seedApprovedAmendment({ ...line, quantity_decimal: undefined }),
    ).toBeNull();
    expect(
      seedApprovedAmendment({
        ...line,
        monthlyDistribution: line.monthlyDistribution?.map((month, index) =>
          index === 2 ? { ...month, month: 1 } : month,
        ),
      }),
    ).toBeNull();
    expect(
      seedApprovedAmendment({
        ...line,
        monthlyDistribution: line.monthlyDistribution?.map((month, index) =>
          index === 0 ? { ...month, monthly_programmed_decimal: "1e2" } : month,
        ),
      }),
    ).toBeNull();
  });

  it("validates exact cents, months and allowed enum without coercing money to number", () => {
    const seed = seedApprovedAmendment(line)!;
    expect(
      buildApprovedAmendment(
        {
          ...seed,
          unit_price: "0.10",
          quantity: "0.30",
          monthly: seed.monthly.map((v, i) =>
            i
              ? { ...v, planned_amount: "0.00" }
              : { ...v, planned_amount: "0.03" },
          ),
        },
        "0",
        false,
      ).request?.unit_price,
    ).toBe("0.10");
    expect(
      buildApprovedAmendment(
        { ...seed, unit_price: "0.01", quantity: "0.01" },
        "0",
        false,
      ).errors.quantity,
    ).toBeTruthy();
    expect(
      buildApprovedAmendment(
        { ...seed, monthly: seed.monthly.slice(1) },
        "0",
        false,
      ).errors.monthly,
    ).toBeTruthy();
    expect(
      buildApprovedAmendment(
        {
          ...seed,
          monthly: seed.monthly.map((v, i) =>
            i === 1 ? { ...v, month: 1 } : v,
          ),
        },
        "0",
        false,
      ).errors.monthly,
    ).toBeTruthy();
    expect(
      buildApprovedAmendment(
        {
          ...seed,
          monthly: seed.monthly.map((v, i) =>
            i ? v : { ...v, planned_amount: "99.99" },
          ),
        },
        "0",
        false,
      ).errors.monthly,
    ).toBeTruthy();
    expect(
      buildApprovedAmendment({ ...seed, importance: "Otro" }, "0", false).errors
        .importance,
    ).toBeTruthy();
    expect(
      buildApprovedAmendment({ ...seed, unit_price: "1e3" }, "0", false).errors
        .unit_price,
    ).toBeTruthy();
    expect(buildApprovedAmendment(seed, "0", true).request).not.toHaveProperty(
      "resource_description",
    );
  });
});
