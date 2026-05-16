import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthGate } from "@/components/auth/auth-gate";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";

const { mockReplace } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

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

function setAuthState(state: Partial<ReturnType<typeof useAuthStore.getState>>) {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    accessTokenExpiresAt: null,
    sessionExpiresAt: null,
    isLoading: true,
    ...state,
  });
}

describe("AuthGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthState({});
  });

  it("blocks protected children while hydrating", () => {
    setAuthState({ isLoading: true, user: null });

    render(
      <AuthGate>
        <div>protected content</div>
      </AuthGate>,
    );

    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows children after the user is authenticated", () => {
    setAuthState({ isLoading: false, user: AUTH_USER, accessToken: "token" });

    render(
      <AuthGate>
        <div>protected content</div>
      </AuthGate>,
    );

    expect(screen.getByText("protected content")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("keeps a safe loading state and redirects when unauthenticated", async () => {
    setAuthState({ isLoading: false, user: null });

    render(
      <AuthGate>
        <div>protected content</div>
      </AuthGate>,
    );

    expect(screen.queryByText("protected content")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/login");
    });
  });
});
