import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPost,
  mockGet,
  mockSetAuth,
  mockSetLoading,
  mockGetAccessTokenFromCookie,
  mockRefreshSession,
} = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockGet: vi.fn(),
  mockSetAuth: vi.fn(),
  mockSetLoading: vi.fn(),
  mockGetAccessTokenFromCookie: vi.fn(),
  mockRefreshSession: vi.fn(),
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: vi.fn((selector: (state: {
    user: null;
    isLoading: boolean;
    setAuth: typeof mockSetAuth;
    setLoading: typeof mockSetLoading;
  }) => unknown) =>
    selector({
      user: null,
      isLoading: true,
      setAuth: mockSetAuth,
      setLoading: mockSetLoading,
    })),
}));

vi.mock("@/lib/api-client", () => ({
  api: {
    post: mockPost,
    get: mockGet,
  },
  ApiRequestError: class ApiRequestError extends Error {
    constructor(public status: number) {
      super(`status-${status}`);
      this.name = "ApiRequestError";
    }
  },
}));

vi.mock("@/lib/auth/session-sync", () => ({
  getAccessTokenFromCookie: mockGetAccessTokenFromCookie,
  normalizeAuthUser: vi.fn(),
}));

vi.mock("@/lib/auth/refresh-session", () => ({
  refreshSession: mockRefreshSession,
}));

import { AuthHydrationProvider } from "@/components/auth/auth-hydration-provider";

describe("AuthHydrationProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessTokenFromCookie.mockReturnValue(null);
    window.history.pushState({}, "", "/");
  });

  it("skips refresh hydration on SSO login handoff URLs", async () => {
    window.history.pushState({}, "", "/login?token=handoff-token");

    render(
      <AuthHydrationProvider>
        <div>sso content</div>
      </AuthHydrationProvider>,
    );

    await waitFor(() => {
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });

    expect(mockPost).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("rehydrates the session through refresh when only the refresh cookie survives", async () => {
    const refreshResponse = {
      accessToken: "new-token",
      accessTokenExpiresAt: "2099-01-01T00:15:00.000Z",
      sessionExpiresAt: "2099-01-01T02:00:00.000Z",
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

    mockRefreshSession.mockResolvedValue(refreshResponse);

    render(
      <AuthHydrationProvider>
        <div>protected content</div>
      </AuthHydrationProvider>,
    );

    expect(screen.queryByText("protected content")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockRefreshSession).toHaveBeenCalledWith({ reason: "hydrate" });
    });
  });

  it("stops loading when refresh continuity also fails", async () => {
    mockRefreshSession.mockRejectedValue(new Error("refresh failed"));

    render(
      <AuthHydrationProvider>
        <div>protected content</div>
      </AuthHydrationProvider>,
    );

    await waitFor(() => {
      expect(mockSetLoading).toHaveBeenCalledWith(false);
    });
  });
});
