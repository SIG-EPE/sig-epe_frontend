import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiRequestError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const XLSX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const VALID_XLSX_BYTES = new Uint8Array([
  0x50, 0x4b, 0x03, 0x04, 0x78, 0x6c, 0x73, 0x78,
]);

function mockXlsxResponse(
  bytes: Uint8Array = VALID_XLSX_BYTES,
  contentType = XLSX_MEDIA_TYPE,
): Response {
  return new Response(new Uint8Array(bytes).buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": 'attachment; filename="report.xlsx"',
    },
  });
}

function getLastRequestHeaders(): Headers {
  const fetchMock = vi.mocked(fetch);
  const [, init] = fetchMock.mock.calls.at(-1) ?? [];
  return new Headers(init?.headers);
}

describe("api client auth headers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    useAuthStore.setState({
      user: null,
      accessToken: "stale-admin-token",
      isLoading: false,
    });
  });

  it("does not send stale Authorization headers to the SSO exchange", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({ data: { accessToken: "sso-token" } }),
    );

    await api.get("/auth/sso?token=handoff-token");

    expect(getLastRequestHeaders().has("Authorization")).toBe(false);
    expect(getLastRequestHeaders().has("Content-Type")).toBe(false);
  });

  it("expone Retry-After de SSO_BUSY al coordinador de reintentos", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 409,
          code: "SSO_BUSY",
          message: "Intercambio SSO en proceso",
          error: "Conflict",
          timestamp: new Date().toISOString(),
          path: "/auth/sso",
        }),
        { status: 409, headers: { "Retry-After": "2" } },
      ),
    );

    const error = await api
      .get("/auth/sso?token=handoff-token")
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).body.code).toBe("SSO_BUSY");
    expect((error as ApiRequestError).headers.get("Retry-After")).toBe("2");
  });

  it("does not add Content-Type when a request has no JSON body", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({ data: { ok: true } }),
    );

    await api.post("/auth/logout");

    expect(getLastRequestHeaders().has("Content-Type")).toBe(false);
  });

  it("adds Content-Type for a JSON body and preserves an explicit value", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockJsonResponse({ data: { ok: true } }))
      .mockResolvedValueOnce(mockJsonResponse({ data: { ok: true } }));

    await api.post("/requests", { concept: "Test" });
    expect(getLastRequestHeaders().get("Content-Type")).toBe(
      "application/json",
    );

    await api.post(
      "/requests",
      { concept: "Test" },
      { headers: { "Content-Type": "application/problem+json" } },
    );
    expect(getLastRequestHeaders().get("Content-Type")).toBe(
      "application/problem+json",
    );
  });

  it("does not send stale Authorization headers to logout", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({ data: { message: "ok" } }),
    );

    await api.post("/auth/logout");

    expect(getLastRequestHeaders().has("Authorization")).toBe(false);
  });

  it("preserves an explicit Authorization header supplied by the caller", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({ data: { id: "user-1" } }),
    );

    await api.get("/auth/me", {
      headers: { Authorization: "Bearer cookie-token" },
    });

    expect(getLastRequestHeaders().get("Authorization")).toBe(
      "Bearer cookie-token",
    );
  });

  it("sends the access token when loading reports", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockJsonResponse({ data: { groups: [], totals: {} } }),
    );

    await api.get("/reports/requests-by-status");

    expect(getLastRequestHeaders().get("Authorization")).toBe(
      "Bearer stale-admin-token",
    );
  });

  it("preserves the access token when exporting reports", async () => {
    vi.mocked(fetch).mockResolvedValue(mockXlsxResponse());

    await api.download("/reports/requests-by-status/export.xlsx");

    expect(getLastRequestHeaders().get("Authorization")).toBe(
      "Bearer stale-admin-token",
    );
  });

  it("posts an authenticated JSON review payload and accepts the exact CSV header", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        '"sequence","stable_id","relative_path","item_type","disposition","reason_code","reference_status","reference_details","manifest_hash"\n"1","item","path","FOLDER","DELETE","CLIENT_REVIEWED","CLEAR","","hash"',
        {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="drive-b1-readiness.csv"',
          },
        },
      ),
    );
    const payload = {
      expectedHash: "c".repeat(64),
      decisions: [{ stableId: "legacy-item-01", disposition: "DELETE" }],
    };

    const result = await api.downloadCsv(
      "/drive-hierarchy/readiness/manifest.csv",
      payload,
    );

    const [, init] = vi.mocked(fetch).mock.calls.at(-1) ?? [];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify(payload));
    expect(getLastRequestHeaders().get("Content-Type")).toBe(
      "application/json",
    );
    expect(getLastRequestHeaders().get("Authorization")).toBe(
      "Bearer stale-admin-token",
    );
    expect(result.filename).toBe("drive-b1-readiness.csv");
  });

  it.each([
    [
      "JSON envelope",
      JSON.stringify({ data: '"sequence","stable_id"', meta: {} }),
    ],
    ["malformed CSV", '"sequence","disposition"\n"1","DELETE"'],
    [
      "renamed reference details column",
      '"sequence","stable_id","relative_path","item_type","disposition","reason_code","reference_status","referenceDetails","manifest_hash"',
    ],
    [
      "reordered columns",
      '"sequence","stable_id","relative_path","item_type","disposition","reason_code","reference_details","reference_status","manifest_hash"',
    ],
    [
      "duplicate column",
      '"sequence","stable_id","relative_path","item_type","disposition","reason_code","reference_status","reference_details","reference_details","manifest_hash"',
    ],
    [
      "extra column",
      '"sequence","stable_id","relative_path","item_type","disposition","reason_code","reference_status","reference_details","manifest_hash","extra"',
    ],
  ])(
    "rejects a successful text/csv response containing %s",
    async (_name, body) => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/csv; charset=utf-8" },
        }),
      );

      const error = await api
        .downloadCsv("/drive-hierarchy/readiness/manifest.csv", {
          expectedHash: "c".repeat(64),
          decisions: [],
        })
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(ApiRequestError);
      expect(error).toMatchObject({
        status: 200,
        body: { code: "INVALID_DOWNLOAD_RESPONSE" },
      });
    },
  );

  it("accepts case-insensitive XLSX media type parameters and a PK signature", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockXlsxResponse(
        VALID_XLSX_BYTES,
        `${XLSX_MEDIA_TYPE.toUpperCase()}; Charset=binary`,
      ),
    );

    const result = await api.download(
      "/reports/requests-by-status/export.xlsx",
    );

    expect(result.filename).toBe("report.xlsx");
    expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(
      VALID_XLSX_BYTES,
    );
  });

  it("rejects a successful response with a non-XLSX media type", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockXlsxResponse(VALID_XLSX_BYTES, "application/json"),
    );

    const error = await api
      .download("/reports/requests-by-status/export.xlsx")
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      status: 200,
      body: { code: "INVALID_DOWNLOAD_RESPONSE" },
    });
  });

  it.each([
    ["wrong", new Uint8Array([0x7b, 0x22, 0x6f, 0x6b])],
    ["truncated", new Uint8Array([0x50, 0x4b, 0x03])],
  ])(
    "rejects a successful XLSX response with a %s signature",
    async (_caseName, bytes) => {
      vi.mocked(fetch).mockResolvedValue(mockXlsxResponse(bytes));

      const error = await api
        .download("/reports/requests-by-status/export.xlsx")
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(ApiRequestError);
      expect(error).toMatchObject({
        status: 200,
        body: { code: "INVALID_DOWNLOAD_RESPONSE" },
      });
    },
  );
});
