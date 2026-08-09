import { describe, expect, it, vi } from "vitest";

import {
  fetchGiofCompatibleQueue,
  getPaymentQueuePath,
  getRenditionsPath,
  getRequestsPath,
  withoutGiofWorkFilters,
} from "@/hooks/use-requests";
import { ApiRequestError } from "@/lib/api-client";
import { GIOF_WORK_SCOPE } from "@/types/giof-work";

describe("filtros GIOF en las colas existentes", () => {
  it("integra mine/all y assignee sin reemplazar los filtros de cada cola", () => {
    expect(getRequestsPath({ scope: "review", work_scope: GIOF_WORK_SCOPE.MINE, page: 2 })).toContain("scope=review&work_scope=mine");
    expect(getPaymentQueuePath({ status: "APPROVED", work_scope: GIOF_WORK_SCOPE.ALL })).toContain("status=APPROVED&work_scope=all");
    expect(getRenditionsPath({ work_scope: GIOF_WORK_SCOPE.ASSIGNEE, assignee_id: "user-1" })).toContain("work_scope=assignee&assignee_id=user-1");
  });

  it("reintenta sin filtros GIOF solo cuando un backend anterior los rechaza", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new ApiRequestError(400, {
        statusCode: 400,
        message: ["property work_scope should not exist"],
        error: "Bad Request",
        timestamp: "2026-08-08T00:00:00.000Z",
        path: "/requests",
      }))
      .mockResolvedValueOnce({ requests: [], total: 0, page: 1, limit: 20 });
    const filters = { scope: "review" as const, work_scope: GIOF_WORK_SCOPE.MINE, page: 1 };

    await expect(fetchGiofCompatibleQueue(
      () => request(getRequestsPath(filters)),
      () => request(getRequestsPath(withoutGiofWorkFilters(filters))),
    )).resolves.toEqual({ requests: [], total: 0, page: 1, limit: 20 });

    expect(request).toHaveBeenNthCalledWith(1, "/requests?page=1&scope=review&work_scope=mine");
    expect(request).toHaveBeenNthCalledWith(2, "/requests?page=1&scope=review");
  });

  it("no oculta otros errores 400 del backend", async () => {
    const error = new ApiRequestError(400, {
      statusCode: 400,
      message: "Invalid status",
      error: "Bad Request",
      timestamp: "2026-08-08T00:00:00.000Z",
      path: "/requests",
    });
    const fallback = vi.fn();

    await expect(fetchGiofCompatibleQueue(
      () => Promise.reject(error),
      fallback,
    )).rejects.toBe(error);
    expect(fallback).not.toHaveBeenCalled();
  });
});
