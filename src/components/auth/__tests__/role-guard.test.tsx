import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoleGuard } from "@/components/auth/role-guard";
import { ROLE_CODE, type RoleCode } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";

const { mockReplace } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

function authUser(roleCode: RoleCode): AuthUser {
  return {
    id: "user-1",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    documentNumber: "12345678",
    onboardingCompleted: true,
    authSource: "LOCAL",
    role: { code: roleCode, name: roleCode },
  };
}

function setAuthState(user: AuthUser | null) {
  useAuthStore.setState({
    user,
    accessToken: user ? "token" : null,
    accessTokenExpiresAt: null,
    sessionExpiresAt: null,
    isLoading: false,
  });
}

describe("RoleGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthState(null);
  });

  it("blocks unauthorized roles without showing children", async () => {
    setAuthState(authUser(ROLE_CODE.SOLICITANTE_EPE));

    render(
      <RoleGuard allowedRoles={[ROLE_CODE.ADMIN_SISTEMA]}>
        <div>admin content</div>
      </RoleGuard>,
    );

    expect(screen.queryByText("admin content")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/requests");
    });
  });

  it("allows authorized roles", () => {
    setAuthState(authUser(ROLE_CODE.ADMIN_SISTEMA));

    render(
      <RoleGuard allowedRoles={[ROLE_CODE.ADMIN_SISTEMA]}>
        <div>admin content</div>
      </RoleGuard>,
    );

    expect(screen.getByText("admin content")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
