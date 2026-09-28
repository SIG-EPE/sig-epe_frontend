import { describe, expect, it } from "vitest";

import {
  buildPlanningLineResourceFields,
  poaCatalogOptionLabel,
} from "../planning-line-resource-contract";

describe("planning line POA resource contract", () => {
  it("creates exactly one resource under the selected operative action", () => {
    expect(
      buildPlanningLineResourceFields({
        actionId: "action-1",
        name: "  New resource  ",
      }),
    ).toEqual({
      new_resource: { name: "New resource", action_id: "action-1" },
    });
  });

  it("rejects missing parents and unsafe or blank names before the request", () => {
    for (const [actionId, name] of [
      [null, "Name"],
      ["action-1", "   "],
      ["action-1", "x\u0000y"],
      ["action-1", "x".repeat(501)],
    ] as const) {
      expect(() =>
        buildPlanningLineResourceFields({
          actionId,
          name,
        }),
      ).toThrow();
    }
  });

  it("renders backend fullCode with the editable name", () => {
    expect(
      poaCatalogOptionLabel({ fullCode: "CMP-000001", name: "Learning" }),
    ).toBe("CMP-000001 — Learning");
  });
});
