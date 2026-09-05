import { describe, expect, it } from "vitest";

import {
  parseRequestReviewUrl,
  serializeRequestReviewUrl,
  updateRequestReviewUrl,
} from "@/lib/queue-filters/review";
import { REQUEST_STATUS } from "@/types/requests";

describe("request review queue adapter", () => {
  it("conserva el golden round-trip, orden y payload exactos de Review", () => {
    const parsed = parseRequestReviewUrl(new URLSearchParams(
      "search=SOL-2026&org_unit_id=123e4567-e89b-12d3-a456-426614174000&amount_max=2500.50&amount_min=10.00&currency=PEN&assigned_to=2026-08-27T17%3A00&assigned_from=2026-08-27T08%3A00&submitted_to=2026-08-28T00%3A00&submitted_from=2026-08-27T00%3A00&status=SUBMITTED&request_type=ADVANCE&assignee_id=123e4567-e89b-12d3-a456-426614174001&work_scope=assignee&limit=50&page=3",
    ));

    expect(parsed).toEqual(expect.objectContaining({ invalidKeys: [], unknownKeys: [] }));
    expect(parsed.filters).toEqual({
      page: 3,
      limit: 50,
      work_scope: "assignee",
      assignee_id: "123e4567-e89b-12d3-a456-426614174001",
      request_type: "ADVANCE",
      status: REQUEST_STATUS.SUBMITTED,
      submitted_from: "2026-08-27T00:00",
      submitted_to: "2026-08-28T00:00",
      assigned_from: "2026-08-27T08:00",
      assigned_to: "2026-08-27T17:00",
      currency: "PEN",
      amount_min: "10.00",
      amount_max: "2500.50",
      org_unit_id: "123e4567-e89b-12d3-a456-426614174000",
      search: "SOL-2026",
    });
    expect(serializeRequestReviewUrl(parsed.filters).toString()).toBe(
      "page=3&limit=50&work_scope=assignee&assignee_id=123e4567-e89b-12d3-a456-426614174001&request_type=ADVANCE&status=SUBMITTED&submitted_from=2026-08-27T00%3A00&submitted_to=2026-08-28T00%3A00&assigned_from=2026-08-27T08%3A00&assigned_to=2026-08-27T17%3A00&currency=PEN&amount_min=10.00&amount_max=2500.50&org_unit_id=123e4567-e89b-12d3-a456-426614174000&search=SOL-2026",
    );
  });

  it("rechaza unknown/duplicados y mantiene defaults sin serializarlos", () => {
    const parsed = parseRequestReviewUrl(new URLSearchParams(
      "page=2&page=3&limit=20&status=SUBMITTED&unknown=x&sort=OLDEST_FIRST",
    ));

    expect(parsed.filters).toEqual({ page: 1, limit: 20, status: REQUEST_STATUS.SUBMITTED });
    expect(parsed.invalidKeys).toContain("page");
    expect(parsed.unknownKeys).toEqual(["unknown", "sort"]);
    expect(serializeRequestReviewUrl({ page: 1, limit: 20 }).toString()).toBe("");
  });

  it("preserva scope y filtros no relacionados, resetea page y no propaga unknown", () => {
    const updated = updateRequestReviewUrl(
      new URLSearchParams("scope=review&page=4&limit=20&status=SUBMITTED&sort=OLDEST_FIRST"),
      { search: "viático" },
    );

    expect(updated.toString()).toBe("scope=review&status=SUBMITTED&search=vi%C3%A1tico");
  });
});
