import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionManager } from "@/components/auth/session-manager";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";

const { mockReplace, mockRefreshSession, mockGetAccessTokenFromCookie, mockClearClientAuthSession } =
  vi.hoisted(() => ({
    mockReplace: vi.fn(),
    mockRefreshSession: vi.fn(),
    mockGetAccessTokenFromCookie: vi.fn(),
    mockClearClientAuthSession: vi.fn(),
  }));

const mockRouter = { replace: mockReplace };

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/lib/auth/refresh-session", () => ({
  refreshSession: mockRefreshSession,
}));

vi.mock("@/lib/auth/session-sync", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session-sync")>(
    "@/lib/auth/session-sync",
  );

  return {
    ...actual,
    getAccessTokenFromCookie: mockGetAccessTokenFromCookie,
    clearClientAuthSession: mockClearClientAuthSession,
  };
});

const AUTH_USER: AuthUser = {
  id: "user-1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  documentNumber: "12345678",
  onboardingCompleted: true,
  authSource: "LOCAL",
  role: { code: "ADMIN_SISTEMA", name: "Admin" },
};

function resetAuthStore() {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    accessTokenExpiresAt: null,
    sessionExpiresAt: null,
    isLoading: true,
  });
}

describe("SessionManager", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    resetAuthStore();
    mockGetAccessTokenFromCookie.mockReturnValue(null);
    mockRefreshSession.mockResolvedValue({
      accessToken: "refreshed-token",
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
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hydrates once for protected layout rerenders", async () => {
    const { rerender } = render(
      <SessionManager>
        <div>protected shell</div>
      </SessionManager>,
    );

    await waitFor(() => {
      expect(mockRefreshSession).toHaveBeenCalledWith({ reason: "hydrate" });
    });

    rerender(
      <SessionManager>
        <div>protected shell updated</div>
      </SessionManager>,
    );

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

  it("schedules proactive refresh before access expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    useAuthStore.setState({
      user: AUTH_USER,
      accessToken: "live-token",
      accessTokenExpiresAt: "2026-01-01T00:02:00.000Z",
      sessionExpiresAt: "2026-01-01T02:00:00.000Z",
      isLoading: false,
    });

    render(
      <SessionManager>
        <div>protected shell</div>
      </SessionManager>,
    );

    expect(mockRefreshSession).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });

    expect(mockRefreshSession).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(mockRefreshSession).toHaveBeenCalledWith({ reason: "proactive" });
  });

  it("cleans up and redirects when hydration refresh fails", async () => {
    mockRefreshSession.mockRejectedValue(new Error("refresh failed"));

    render(
      <SessionManager>
        <div>protected shell</div>
      </SessionManager>,
    );

    await waitFor(() => {
      expect(mockClearClientAuthSession).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("recovers the protected shell after reload when access expired but refresh succeeds", async () => {
    mockRefreshSession.mockImplementation(async () => {
      useAuthStore.getState().setAuth(AUTH_USER, "refreshed-token", {
        accessTokenExpiresAt: "2099-01-01T00:15:00.000Z",
        sessionExpiresAt: "2099-01-08T00:00:00.000Z",
      });

      return {
        accessToken: "refreshed-token",
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
    });

    render(
      <SessionManager>
        <div>protected shell</div>
      </SessionManager>,
    );

    await waitFor(() => {
      expect(useAuthStore.getState().accessToken).toBe("refreshed-token");
    });

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockClearClientAuthSession).not.toHaveBeenCalled();
  });
});
