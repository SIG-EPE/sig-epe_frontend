import { describe, expect, it } from "vitest";
import { businessExportFilename, safeBusinessExportFilename } from "@/lib/business-export-filename";

describe("business queue filenames", () => {
  it.each([
    ["2026-10-01T04:59:00.000Z", "2026-09-30_23-59"],
    ["2026-10-01T05:00:00.000Z", "2026-10-01_00-00"],
  ])("formats Lima local time at %s", (instant, suffix) => {
    for (const queue of ["solicitudes-revision", "pagos", "rendiciones"] as const) {
      expect(businessExportFilename(queue, new Date(instant))).toBe(`${queue}_${suffix}.xlsx`);
    }
  });

  it("accepts only its own fixed queue filename without user identifiers", () => {
    expect(safeBusinessExportFilename("pagos", "pagos_2026-09-30_23-59.xlsx"))
      .toBe("pagos_2026-09-30_23-59.xlsx");
    for (const filename of ["pagos_user-123_2026-09-30_23-59.xlsx", "../pagos_2026-09-30_23-59.xlsx", "rendiciones_2026-09-30_23-59.xlsx"]) {
      expect(safeBusinessExportFilename("pagos", filename)).toMatch(/^pagos_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.xlsx$/);
      expect(safeBusinessExportFilename("pagos", filename)).not.toBe(filename);
    }
  });
});
