import { describe, expect, it } from "vitest";

import {
  parseRenditionsQueueUrl,
  serializeRenditionsQueueUrl,
  updateRenditionsQueueUrl,
} from "@/lib/queue-filters/renditions";

describe("Renditions queue URL adapter", () => {
  it("rechaza unknown, duplicados, rangos y combinaciones de responsable inválidas", () => {
    const parsed = parseRenditionsQueueUrl(new URLSearchParams(
      "status=PENDING&status=OVERDUE&document_complete=true&deadline_from=2026-06-30&deadline_to=2026-06-01&work_scope=assignee&assignee_id=invalid",
    ));

    expect(parsed.unknownKeys).toEqual(["document_complete"]);
    expect(parsed.invalidKeys).toEqual(expect.arrayContaining([
      "status",
      "deadline_from",
      "deadline_to",
      "work_scope",
      "assignee_id",
    ]));
  });

  it("acepta aliases legacy y canonicaliza sin ALL ni nombres deprecated", () => {
    const parsed = parseRenditionsQueueUrl(new URLSearchParams(
      "status=ALL&bucket=due_soon&due_from=2026-06-01&due_to=2026-06-30&page=2",
    ));

    expect(parsed).toMatchObject({
      invalidKeys: [],
      unknownKeys: [],
      filters: {
        page: 2,
        limit: 20,
        deadline_bucket: "due_soon",
        deadline_from: "2026-06-01",
        deadline_to: "2026-06-30",
      },
    });
    expect(serializeRenditionsQueueUrl(parsed.filters).toString()).toBe(
      "page=2&deadline_from=2026-06-01&deadline_to=2026-06-30&deadline_bucket=due_soon",
    );
  });

  it("rechaza conflictos entre alias y canonical", () => {
    const parsed = parseRenditionsQueueUrl(new URLSearchParams(
      "deadline_from=2026-06-01&due_from=2026-06-02&deadline_bucket=overdue&bucket=due_soon",
    ));

    expect(parsed.invalidKeys).toEqual(expect.arrayContaining([
      "deadline_from",
      "due_from",
      "deadline_bucket",
      "bucket",
    ]));
  });

  it("reinicia page al cambiar filtros y conserva la página al paginar", () => {
    const current = new URLSearchParams("page=4&status=PENDING&deadline_bucket=due_today");

    expect(updateRenditionsQueueUrl(current, { search: "SOL-1" }).toString()).toBe(
      "status=PENDING&search=SOL-1&deadline_bucket=due_today",
    );
    expect(updateRenditionsQueueUrl(current, { page: 3 }).toString()).toBe(
      "page=3&status=PENDING&deadline_bucket=due_today",
    );
  });
});
