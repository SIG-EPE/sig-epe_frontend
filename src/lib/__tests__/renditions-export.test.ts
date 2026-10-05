import { describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api-client";
import {
  buildRenditionsExportPath,
  downloadRenditionsExport,
  saveRenditionsExport,
} from "@/lib/renditions-export";
import { parseRenditionsQueueUrl } from "@/lib/queue-filters/renditions";

vi.mock("@/lib/api-client", () => ({ api: { download: vi.fn() } }));

describe("renditions business export", () => {
  it("maps applied queue filters and sort, not pagination, aliases or unrelated tabs", () => {
    const { filters } = parseRenditionsQueueUrl(new URLSearchParams(
      "page=3&limit=20&status=IN_REVIEW&search=REXAN%20uno&bucket=due_soon&due_from=2026-08-01&due_to=2026-08-31&work_scope=assignee&assignee_id=11111111-1111-4111-8111-111111111111&sort=due_date&direction=asc",
    ));
    expect(buildRenditionsExportPath(filters)).toBe(
      "/requests/renditions/export-business.xlsx?status=IN_REVIEW&search=REXAN+uno&work_scope=assignee&assignee_id=11111111-1111-4111-8111-111111111111&deadline_from=2026-08-01&deadline_to=2026-08-31&deadline_bucket=due_soon&sort=due_date&direction=asc",
    );
    expect(buildRenditionsExportPath({ ...filters, work_scope: "all", assignee_id: undefined })).toContain("work_scope=all");
  });

  it("rejects empty and truncated ZIP downloads and never saves them", async () => {
    const signal = new AbortController().signal;
    vi.mocked(api.download).mockResolvedValue({ blob: new Blob([]), filename: null });
    await expect(downloadRenditionsExport({}, signal)).rejects.toThrow();
    vi.mocked(api.download).mockResolvedValue({ blob: new Blob([new Uint8Array([80, 75, 3, 4])]), filename: null });
    await expect(downloadRenditionsExport({}, signal)).rejects.toThrow();
  });

  it("does not begin a canceled download", async () => {
    vi.mocked(api.download).mockClear();
    const controller = new AbortController();
    controller.abort();
    await expect(downloadRenditionsExport({}, controller.signal)).rejects.toThrow();
    expect(api.download).not.toHaveBeenCalled();
  });

  it("falls back to a safe filename and revokes the object URL", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:safe");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toMatch(/^rendiciones_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.xlsx$/);
    });
    try {
      saveRenditionsExport({ blob: new Blob(["valid"]), filename: "../../unsafe.xlsx" });
      expect(click).toHaveBeenCalledOnce();
      expect(revoke).toHaveBeenCalledWith("blob:safe");
    } finally {
      create.mockRestore();
      revoke.mockRestore();
      click.mockRestore();
    }
  });
});
