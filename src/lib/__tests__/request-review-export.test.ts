import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, type ApiDownloadResult } from "@/lib/api-client";
import {
  buildRequestReviewExportPath,
  downloadRequestReviewExport,
  saveRequestReviewExport,
} from "@/lib/request-review-export";
import { GIOF_WORK_SCOPE } from "@/types/giof-work";
import { REQUEST_CURRENCY, REQUEST_STATUS, REQUEST_TYPE } from "@/types/requests";

vi.mock("@/lib/api-client", () => ({
  api: { download: vi.fn() },
}));

const downloadMock = vi.mocked(api.download);

describe("request review Excel export", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    downloadMock.mockReset();
  });

  it("construye el endpoint all-filtered con todos los filtros canónicos y sin page/limit", () => {
    const path = buildRequestReviewExportPath({
      page: 7,
      limit: 100,
      work_scope: GIOF_WORK_SCOPE.ASSIGNEE,
      assignee_id: "11111111-1111-4111-8111-111111111111",
      request_type: REQUEST_TYPE.ADVANCE,
      status: REQUEST_STATUS.OBSERVED,
      submitted_from: "2026-08-01T08:00",
      submitted_to: "2026-08-15T18:00",
      assigned_from: "2026-08-02T09:00",
      assigned_to: "2026-08-16T17:00",
      currency: REQUEST_CURRENCY.PEN,
      amount_min: "100.00",
      amount_max: "900.00",
      org_unit_id: "22222222-2222-4222-8222-222222222222",
      search: "  viático agosto  ",
    });

    expect(path).toBe(
      "/requests/review/export.xlsx?work_scope=assignee&assignee_id=11111111-1111-4111-8111-111111111111&request_type=ADVANCE&status=OBSERVED&submitted_from=2026-08-01T08%3A00&submitted_to=2026-08-15T18%3A00&assigned_from=2026-08-02T09%3A00&assigned_to=2026-08-16T17%3A00&currency=PEN&amount_min=100.00&amount_max=900.00&org_unit_id=22222222-2222-4222-8222-222222222222&search=vi%C3%A1tico+agosto",
    );
    expect(path).not.toMatch(/[?&](page|limit)=/);
  });

  it("delega Blob, MIME, firma, Bearer/cookie y refresh 401 al api.download existente, pasando AbortSignal", async () => {
    const controller = new AbortController();
    const result: ApiDownloadResult = {
      blob: new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])]),
      filename: "bandeja-revision-2026-08-28_2215-lima.xlsx",
    };
    downloadMock.mockResolvedValue(result);

    await expect(downloadRequestReviewExport({ work_scope: GIOF_WORK_SCOPE.MINE }, controller.signal)).resolves.toBe(result);
    expect(downloadMock).toHaveBeenCalledWith(
      "/requests/review/export.xlsx?work_scope=mine",
      { signal: controller.signal },
    );
  });

  it("usa Content-Disposition como filename y siempre revoca el object URL", () => {
    const click = vi.fn();
    const remove = vi.fn();
    const link = { href: "", download: "", click, remove } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(link);
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:review-export");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    saveRequestReviewExport({
      blob: new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])]),
      filename: "desde-content-disposition.xlsx",
    });

    expect(link.download).toBe("desde-content-disposition.xlsx");
    expect(link.href).toBe("blob:review-export");
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:review-export");
  });

  it("usa filename seguro de respaldo y revoca incluso si el click falla", () => {
    const link = {
      href: "",
      download: "",
      click: vi.fn(() => { throw new Error("click failed"); }),
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(link);
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:review-export");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    expect(() => saveRequestReviewExport({ blob: new Blob(["xlsx"]), filename: null })).toThrow("click failed");
    expect(link.download).toBe("bandeja-revision.xlsx");
    expect(link.remove).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:review-export");
  });
});
