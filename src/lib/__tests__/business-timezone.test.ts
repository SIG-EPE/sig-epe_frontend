import { describe, expect, it } from "vitest";

import {
  BUSINESS_TIME_ZONE,
  formatBusinessDate,
  formatBusinessDateTime,
  getBusinessDateString,
  getBusinessDateTimeLocalValue,
  getDateOnlyUtcTime,
  parseBusinessDateTimeLocalToIso,
} from "@/lib/business-timezone";

describe("business timezone utilities", () => {
  it("uses America/Lima as the business timezone", () => {
    expect(BUSINESS_TIME_ZONE).toBe("America/Lima");
  });

  it("serializes datetime-local values as Lima business time", () => {
    expect(parseBusinessDateTimeLocalToIso("2026-05-31T23:59")).toBe("2026-06-01T04:59:00.000Z");
    expect(parseBusinessDateTimeLocalToIso("2026-06-01T00:00")).toBe("2026-06-01T05:00:00.000Z");
  });

  it("derives Lima date strings and datetime-local defaults from instants", () => {
    expect(getBusinessDateString("2026-06-01T04:59:59.000Z")).toBe("2026-05-31");
    expect(getBusinessDateTimeLocalValue("2026-06-01T04:59:59.000Z")).toBe("2026-05-31T23:59");
  });

  it("handles date-only values without browser timezone shifts", () => {
    expect(getDateOnlyUtcTime("2026-05-31")).toBe(Date.UTC(2026, 4, 31));
    expect(getDateOnlyUtcTime("2026-05-31T23:59:59.000Z")).toBe(Date.UTC(2026, 4, 31));
  });

  it("formats user-facing dates with Lima timezone", () => {
    expect(formatBusinessDate("2026-06-01T04:59:59.000Z", { day: "2-digit", month: "2-digit", year: "numeric" })).toBe("31/05/2026");
    expect(formatBusinessDateTime("2026-06-01T05:00:00.000Z")).toContain("1 jun");
  });

  it("formats date-only values without shifting them to the previous Lima day", () => {
    expect(formatBusinessDate("2026-06-01", { day: "2-digit", month: "2-digit", year: "numeric" })).toBe("01/06/2026");
    expect(formatBusinessDate("2026-06-01")).toContain("1 jun");
  });
});
