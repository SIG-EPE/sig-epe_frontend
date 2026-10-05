import { describe, expect, it } from "vitest";

import {
  parseRenditionsQueueUrl,
  serializeRenditionsQueueUrl,
} from "@/lib/queue-filters/renditions";

describe("renditions queue pre-export characterization", () => {
  it("canonicalizes legacy deadline aliases while retaining applied status, sort and scope", () => {
    const parsed = parseRenditionsQueueUrl(
      new URLSearchParams(
        "page=3&limit=20&status=PENDING&bucket=due_soon&due_from=2026-08-01&due_to=2026-08-31&work_scope=mine&sort=last_activity&direction=desc",
      ),
    );
    expect(parsed.invalidKeys).toEqual([]);
    expect(parsed.unknownKeys).toEqual([]);
    expect(parsed.filters).toMatchObject({
      page: 3,
      status: "PENDING",
      deadline_bucket: "due_soon",
      deadline_from: "2026-08-01",
      deadline_to: "2026-08-31",
      work_scope: "mine",
    });
    const serialized = serializeRenditionsQueueUrl(parsed.filters);
    expect(serialized.get("deadline_bucket")).toBe("due_soon");
    expect(serialized.get("deadline_from")).toBe("2026-08-01");
    expect(serialized.has("bucket")).toBe(false);
    expect(serialized.has("due_from")).toBe(false);
  });

  it("marks conflicting alias and unsupported key invalid before queue query", () => {
    const parsed = parseRenditionsQueueUrl(
      new URLSearchParams(
        "deadline_from=2026-08-01&due_from=2026-08-02&request_id=internal",
      ),
    );
    expect(parsed.invalidKeys).toEqual(
      expect.arrayContaining(["deadline_from", "due_from"]),
    );
    expect(parsed.unknownKeys).toContain("request_id");
  });

  it.todo(
    "RED future renditions export: include all linked REXAN and separate missing REXAN without page/limit",
  );
});
