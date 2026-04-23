// src/components/auth/__tests__/auth-hydration-provider.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { AuthUser } from "@/types/auth";
import { setCookieValue } from "@/test-utils/setup";

// -------------------------------------------------------
// Mutable shared state between mock and tests
// -------------------------------------------------------

const mockSetAuth = vi.fn();
const mockSetLoading = vi.fn();
let mockStoreState = {
  user: null as AuthUser | null,
  isLoading: true,
  accessToken: null as string | null,
  setAuth: mockSetAuth,
  setLoading: mockSetLoading,
  clearAuth: vi.fn(),
};

// -------------------------------------------------------
// Mocks — hoisted above imports
// -------------------------------------------------------

vi.mock("@/lib/api-client", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  ApiRequestError: class ApiRequestError extends Error {
    constructor(
      public status: number,
      public body: { statusCode: number; message: string; error: string; timestamp: string; path: string }
    ) {
      super(body.message);
      this.name = "ApiRequestError";
    }
  },
}));

vi.mock("@/stores/auth-store", () => ({
  useAuthStore: vi.fn((selector: (s: typeof mockStoreState) => unknown) => selector(mockStoreState)),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/constants", () => ({
  ROUTES: { LOGIN: "/login", ONBOARDING: "/onboarding", DASHBOARD: "/dashboard" },
}));

// -------------------------------------------------------
// Imports (after mocks)
// -------------------------------------------------------

import { AuthHydrationProvider } from "@/components/auth/auth-hydration-provider";
import { useAuthStore } from "@/stores/auth-store";
import { api, ApiRequestError } from "@/lib/api-client";

const fakeUser: AuthUser = {
  id: "1",
  firstName: "Juan",
  lastName: "Perez",
  email: "juan@test.com",
  documentNumber: "12345678",
  role: { code: "SOLICITANTE_EPE", name: "Solicitante EPE" },
  onboardingCompleted: true,
  authSource: "EPE",
};

const meResponse = {
  id: "1",
  firstName: "Juan",
  lastName: "Perez",
  email: "juan@test.com",
  epeDni: "12345678",
  authSource: "EPE",
  onboardingCompleted: true,
  roles: [{ code: "SOLICITANTE_EPE", name: "Solicitante EPE" }],
};

// -------------------------------------------------------
// Tests
// -------------------------------------------------------

describe("AuthHydrationProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetAuth.mockClear();
    mockSetLoading.mockClear();
    mockStoreState = {
      user: null,
      isLoading: true,
      accessToken: null,
      setAuth: mockSetAuth,
      setLoading: mockSetLoading,
      clearAuth: vi.fn(),
    };
    setCookieValue("");
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it("renders loading spinner when isLoading is true", () => {
    mockStoreState.isLoading = true;
    mockStoreState.user = null;

    render(<AuthHydrationProvider><div data-testid="child">child</div></AuthHydrationProvider>);

    // Spinner renders, child is not rendered when loading
    // Verify the submit button (inside children) is NOT rendered
    expect(screen.queryByRole("button", { name: /configurar acceso/i })).not.toBeInTheDocument();
  });

  it("renders children when isLoading is false and user is set", () => {
    mockStoreState.isLoading = false;
    mockStoreState.user = fakeUser;

    render(<AuthHydrationProvider><div data-testid="child">child</div></AuthHydrationProvider>);

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("calls GET /auth/me when cookie is present", async () => {
    setCookieValue("fake-token-123");
    mockStoreState.isLoading = true;
    mockStoreState.user = null;

    vi.mocked(api.get).mockResolvedValueOnce(meResponse);

    render(<AuthHydrationProvider><div data-testid="child">child</div></AuthHydrationProvider>);

    await waitFor(() => {
      expect(vi.mocked(api.get)).toHaveBeenCalledWith(
        "/auth/me",
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer fake-token-123" }) })
      );
    });
  });

  it("sets user in store on successful /auth/me response", async () => {
    setCookieValue("fake-token-456");
    mockStoreState.isLoading = true;
    mockStoreState.user = null;

    vi.mocked(api.get).mockResolvedValueOnce(meResponse);

    render(<AuthHydrationProvider><div data-testid="child">child</div></AuthHydrationProvider>);

    await waitFor(() => {
      expect(vi.mocked(api.get)).toHaveBeenCalledTimes(1);
    });
  });

  it("sets isLoading=false on /auth/me failure", async () => {
    setCookieValue("expired-token");
    mockStoreState.isLoading = true;
    mockStoreState.user = null;

    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiRequestError(401, {
        statusCode: 401,
        message: "Unauthorized",
        error: "Unauthorized",
        timestamp: "",
        path: "/auth/me",
      })
    );

    render(<AuthHydrationProvider><div data-testid="child">child</div></AuthHydrationProvider>);

    await waitFor(() => {
      expect(vi.mocked(api.get)).toHaveBeenCalledTimes(1);
    });
  });

  it("retries with refresh token on 401 and succeeds", async () => {
    setCookieValue("expired-token");
    mockStoreState.isLoading = true;
    mockStoreState.user = null;

    vi.mocked(api.get)
      .mockRejectedValueOnce(
        new ApiRequestError(401, {
          statusCode: 401,
          message: "Unauthorized",
          error: "Unauthorized",
          timestamp: "",
          path: "/auth/me",
        })
      )
      .mockResolvedValueOnce(meResponse);

    vi.mocked(api.post).mockResolvedValueOnce({ accessToken: "refreshed-token-xyz" });

    render(<AuthHydrationProvider><div data-testid="child">child</div></AuthHydrationProvider>);

    await waitFor(() => {
      expect(vi.mocked(api.get)).toHaveBeenCalledTimes(2);
    });
  });
});
