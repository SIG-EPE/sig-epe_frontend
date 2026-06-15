import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api-client";
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
