import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, type ApiDownloadResult } from "@/lib/api-client";
import { GIOF_WORK_SCOPE } from "@/types/giof-work";
import { PAYMENT_COMPLETENESS } from "@/types/requests";
import {
  parsePaymentQueueUrl,
  PAYMENT_QUEUE_TAB,
} from "@/lib/queue-filters/payment";
import {
  buildPaymentQueueExportPath,
  downloadPaymentQueueExport,
  getAppliedPaymentQueueFilters,
  savePaymentQueueExport,
} from "@/lib/payment-queue-export";

vi.mock("@/lib/api-client", () => ({ api: { download: vi.fn() } }));
const downloadMock = vi.mocked(api.download);
const validZip = new Uint8Array([
  0x50,
  0x4b,
  0x03,
  0x04,
  0,
  0,
  0,
  0,
  0x50,
  0x4b,
  0x01,
  0x02,
  ...new Array(42).fill(0),
  0x50,
  0x4b,
  0x05,
  0x06,
  0,
  0,
  0,
  0,
  1,
  0,
  1,
  0,
  46,
  0,
  0,
  0,
  8,
  0,
  0,
  0,
  0,
  0,
]);

describe("payment-only queue Excel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    downloadMock.mockReset();
  });

  it.each([
    [PAYMENT_QUEUE_TAB.APPROVED, "APPROVED", null],
    [PAYMENT_QUEUE_TAB.PAID, "PAID", null],
    [PAYMENT_QUEUE_TAB.PENDING_DATA, "PAID", PAYMENT_COMPLETENESS.ANY_MISSING],
    [PAYMENT_QUEUE_TAB.REJECTED, "REJECTED", null],
  ])(
    "uses applied %s tab, work scope and sort, never page/limit/tab",
    (tab, status, completeness) => {
      const { filters, invalidKeys, unknownKeys } = parsePaymentQueueUrl(
        new URLSearchParams(
          `tab=${tab}&page=9&limit=20&work_scope=mine&sort=queue_date_asc&search=%20SOL%20&paid_from=2026-09-01`,
        ),
      );
      expect(invalidKeys).toEqual([]);
      expect(unknownKeys).toEqual([]);
      const applied = getAppliedPaymentQueueFilters(
        filters,
        GIOF_WORK_SCOPE.MINE,
      );
      const path = buildPaymentQueueExportPath(applied);
      const params = new URL(path, "https://example.test").searchParams;
      expect(path.startsWith("/request-payments/export-business.xlsx?")).toBe(
        true,
      );
      expect(params.get("status")).toBe(status);
      expect(params.get("completeness")).toBe(completeness);
      expect(params.get("work_scope")).toBe("mine");
      expect(params.get("sort")).toBe("queue_date_asc");
      expect(params.get("search")).toBe("SOL");
      expect(params.get("paid_from")).toBe("2026-09-01");
      for (const key of ["page", "limit", "tab", "request_id", "payment_id"])
        expect(params.has(key)).toBe(false);
    },
  );

  it("retains manager assignee and canonical optional filters without leaking row IDs", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const filters = parsePaymentQueueUrl(
      new URLSearchParams(
        `work_scope=assignee&assignee_id=${id}&source_account_key=BCP_PEN&currency=PEN&amount_min=10.00&amount_max=20.00&completeness=complete`,
      ),
    ).filters;
    const params = new URL(
      buildPaymentQueueExportPath(
        getAppliedPaymentQueueFilters(filters, GIOF_WORK_SCOPE.ASSIGNEE, id),
      ),
      "https://example.test",
    ).searchParams;
    expect(params.get("assignee_id")).toBe(id);
    expect(params.get("source_account_key")).toBe("BCP_PEN");
    expect(params.get("amount_min")).toBe("10.00");
    expect(params.get("completeness")).toBe("complete");
    expect(params.has("bank_account")).toBe(false);
  });

  it("downloads once with abort, validates completed XLSX and never falls back", async () => {
    const controller = new AbortController();
    const result: ApiDownloadResult = {
      blob: new Blob([validZip]),
      filename: "bandeja-pagos.xlsx",
    };
    downloadMock.mockResolvedValue(result);
    await expect(
      downloadPaymentQueueExport(
        getAppliedPaymentQueueFilters({}, GIOF_WORK_SCOPE.ALL),
        controller.signal,
      ),
    ).resolves.toBe(result);
    expect(downloadMock).toHaveBeenCalledExactlyOnceWith(
      "/request-payments/export-business.xlsx?status=APPROVED&work_scope=all",
      { signal: controller.signal },
    );
    controller.abort();
    await expect(
      downloadPaymentQueueExport({}, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(downloadMock).toHaveBeenCalledTimes(1);
  });

  it.each([new Blob([]), new Blob([validZip.slice(0, 4)])])(
    "rejects empty or partial ZIP",
    async (blob) => {
      downloadMock.mockResolvedValue({ blob, filename: "bandeja-pagos.xlsx" });
      await expect(
        downloadPaymentQueueExport({}, new AbortController().signal),
      ).rejects.toThrow();
    },
  );

  it("keeps 403/422 as errors without retry or download", async () => {
    const error = new Error("403 or 422");
    downloadMock.mockRejectedValue(error);
    await expect(
      downloadPaymentQueueExport({}, new AbortController().signal),
    ).rejects.toBe(error);
    expect(downloadMock).toHaveBeenCalledTimes(1);
  });

  it("uses safe filename and always revokes blob URL", () => {
    const link = {
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(link);
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:payments");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    savePaymentQueueExport({
      blob: new Blob([validZip]),
      filename: "../bank.xlsx",
    });
    expect(link.download).toMatch(/^pagos_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.xlsx$/);
    expect(link.click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:payments");
  });
});
