import { beforeEach, describe, expect, it, vi } from "vitest";

import { api, ApiRequestError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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
    useAuthStore.setState({ user: null, accessToken: "stale-admin-token", isLoading: false });
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

    const error = await api.get("/auth/sso?token=handoff-token").catch((caught) => caught);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).body.code).toBe("SSO_BUSY");
    expect((error as ApiRequestError).headers.get("Retry-After")).toBe("2");
  });

  it("does not add Content-Type when a request has no JSON body", async () => {
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ data: { ok: true } }));

    await api.post("/auth/logout");

    expect(getLastRequestHeaders().has("Content-Type")).toBe(false);
  });

  it("adds Content-Type for a JSON body and preserves an explicit value", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(mockJsonResponse({ data: { ok: true } }))
      .mockResolvedValueOnce(mockJsonResponse({ data: { ok: true } }));

    await api.post("/requests", { concept: "Test" });
    expect(getLastRequestHeaders().get("Content-Type")).toBe("application/json");

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
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ data: { message: "ok" } }));

    await api.post("/auth/logout");

    expect(getLastRequestHeaders().has("Authorization")).toBe(false);
  });

  it("preserves an explicit Authorization header supplied by the caller", async () => {
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ data: { id: "user-1" } }));

    await api.get("/auth/me", {
      headers: { Authorization: "Bearer cookie-token" },
    });

    expect(getLastRequestHeaders().get("Authorization")).toBe("Bearer cookie-token");
  });

  it("sends the access token when loading reports", async () => {
    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ data: { groups: [], totals: {} } }));

    await api.get("/reports/requests-by-status");

    expect(getLastRequestHeaders().get("Authorization")).toBe("Bearer stale-admin-token");
  });

  it("preserves the access token when exporting reports", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("xlsx", { status: 200 }));

    await api.download("/reports/requests-by-status/export.xlsx");

    expect(getLastRequestHeaders().get("Authorization")).toBe("Bearer stale-admin-token");
  });
});
