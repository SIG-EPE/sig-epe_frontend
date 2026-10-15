import { describe, expect, it } from "vitest";
import { buildFundingChanges, seedFundingDraft } from "../approved-funding";

const existing = [
  { id: "association-a", funding_source_id: "source-a", planning_line_id: "line", allocated_amount: 20, percentage: 40 },
  { id: "association-b", funding_source_id: "source-b", planning_line_id: "line", allocated_amount: null },
];
const active = ["source-a", "source-b", "source-c", "source-d"];

describe("approved funding membership draft", () => {
  it("adds two and edits one by stable association ID without deleting or sending allocation", () => {
    const draft = seedFundingDraft(existing)!;
    const changed = { existing: draft.existing.map((row) => row.association_id === "association-a" ? { ...row, funding_source_id: "source-c" } : row), added: ["source-a", "source-d"] };
    const result = buildFundingChanges(draft, changed, active);
    expect(result).toEqual({ changes: { add: [{ funding_source_id: "source-a" }, { funding_source_id: "source-d" }], edit: [{ association_id: "association-a", funding_source_id: "source-c" }] }, error: null });
    expect(result.changes).not.toHaveProperty("remove");
  });

  it("rejects duplicate final selections, inactive targets, missing row IDs and oversized commands", () => {
    const baseline = seedFundingDraft(existing)!;
    expect(buildFundingChanges(baseline, { existing: baseline.existing, added: ["source-a"] }, active).error).toMatch(/ya está/);
    expect(buildFundingChanges(baseline, { existing: baseline.existing, added: ["inactive"] }, active).error).toMatch(/activa/);
    expect(seedFundingDraft([{ id: "", funding_source_id: "source-a" }])).toBeNull();
    expect(buildFundingChanges(baseline, { existing: baseline.existing.slice(1), added: [] }, active).error).toBeTruthy();
    expect(buildFundingChanges(baseline, { existing: baseline.existing, added: Array.from({ length: 11 }, (_, i) => `source-${i}`) }, active).error).toBeTruthy();
    expect(buildFundingChanges(baseline, baseline, active)).toEqual({ changes: null, error: null });
  });
});
