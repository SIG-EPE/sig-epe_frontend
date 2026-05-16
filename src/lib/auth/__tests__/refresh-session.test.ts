import { beforeEach, describe, expect, it, vi } from "vitest";

import { refreshSession } from "@/lib/auth/refresh-session";
import { useAuthStore } from "@/stores/auth-store";

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("refreshSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    useAuthStore.setState({
      user: null,
      accessToken: null,
      accessTokenExpiresAt: null,
      sessionExpiresAt: null,
      isLoading: true,
    });
  });

  it("deduplicates concurrent refresh callers into one backend request", async () => {
    const refreshResponse = {
      accessToken: "new-token",
      accessTokenExpiresAt: "2099-01-01T00:15:00.000Z",
      sessionExpiresAt: "2099-01-08T00:00:00.000Z",
      onboardingRequired: false,
      user: {
        id: "user-1",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        epeDni: "12345678",
        onboardingCompleted: true,
        authSource: "LOCAL",
        roles: [{ code: "ADMIN_SISTEMA", name: "Admin" }],
      },
    };

    vi.mocked(fetch).mockResolvedValue(mockJsonResponse({ data: refreshResponse }));

    const [hydrate, api401, proactive, inactivity] = await Promise.all([
      refreshSession({ reason: "hydrate" }),
      refreshSession({ reason: "api-401" }),
      refreshSession({ reason: "proactive" }),
      refreshSession({ reason: "inactivity" }),
    ]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(api401.accessToken).toBe("new-token");
    expect(proactive).toBe(hydrate);
    expect(inactivity).toBe(hydrate);
    expect(useAuthStore.getState().accessToken).toBe("new-token");
  });
});
