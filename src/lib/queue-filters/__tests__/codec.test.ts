import { describe, expect, it } from "vitest";

import {
  appendCanonicalQueueParam,
  readStrictQueueParams,
  updateQueueFilterUrl,
  type QueueFilterRouteAdapter,
} from "@/lib/queue-filters/codec";

const TEST_QUERY_KEY = {
  PAGE: "page",
  LIMIT: "limit",
  STATUS: "status",
} as const;

type TestQueryKey = (typeof TEST_QUERY_KEY)[keyof typeof TEST_QUERY_KEY];

interface TestFilters {
  page?: number;
  limit?: number;
  status?: string;
}

describe("queue filter URL codec", () => {
  it("separa claves desconocidas y duplicadas sin elegir silenciosamente un valor", () => {
    const result = readStrictQueueParams(
      new URLSearchParams("page=2&page=3&limit=20&unknown=x"),
      Object.values(TEST_QUERY_KEY),
    );

    expect(result.values).toEqual({ limit: "20" });
    expect(result.duplicateKeys).toEqual([TEST_QUERY_KEY.PAGE]);
    expect(result.unknownKeys).toEqual(["unknown"]);
  });

  it("omite defaults y sentinels al escribir parámetros canónicos", () => {
    const params = new URLSearchParams();

    appendCanonicalQueueParam(params, TEST_QUERY_KEY.PAGE, 1, { defaultValue: 1 });
    appendCanonicalQueueParam(params, TEST_QUERY_KEY.STATUS, "ALL", { sentinelValues: ["ALL"] });
    appendCanonicalQueueParam(params, TEST_QUERY_KEY.LIMIT, 50, { defaultValue: 20 });

    expect(params.toString()).toBe("limit=50");
  });

  it("delega semántica al adapter de ruta, reinicia page al cambiar vista y conserva page al paginar", () => {
    const adapter: QueueFilterRouteAdapter<TestFilters> = {
      parse: (params) => ({
        filters: {
          page: Number(params.get("page") ?? "1"),
          limit: Number(params.get("limit") ?? "20"),
          status: params.get("status") ?? undefined,
        },
        invalidKeys: [],
        unknownKeys: [],
      }),
      serialize: (filters) => {
        const params = new URLSearchParams();
        appendCanonicalQueueParam(params, "page", filters.page, { defaultValue: 1 });
        appendCanonicalQueueParam(params, "limit", filters.limit, { defaultValue: 20 });
        appendCanonicalQueueParam(params, "status", filters.status);
        return params;
      },
    };

    expect(updateQueueFilterUrl(
      new URLSearchParams("scope=review&page=4&status=SUBMITTED"),
      { status: "OBSERVED" },
      adapter,
      { preservedKeys: ["scope"] },
    ).toString()).toBe("scope=review&status=OBSERVED");
    expect(updateQueueFilterUrl(
      new URLSearchParams("scope=review&page=4&status=SUBMITTED"),
      { page: 5 },
      adapter,
      { preservedKeys: ["scope"] },
    ).toString()).toBe("scope=review&page=5&status=SUBMITTED");
  });
});
