import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RouteAccessGuard } from "@/components/auth/route-access-guard";
import { ROLE_CODE, type RoleCode } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser } from "@/types/auth";

const { mockReplace, mockUsePathname } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockUsePathname: vi.fn(() => "/payments"),
}));

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
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

describe("RouteAccessGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/payments");
    setAuthState(null);
  });

  it("blocks protected route children for unauthorized direct URLs", async () => {
    setAuthState(authUser(ROLE_CODE.SOLICITANTE_EPE));

    render(
      <RouteAccessGuard>
        <div>payment content</div>
      </RouteAccessGuard>,
    );

    expect(screen.queryByText("payment content")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/requests");
    });
  });

  it("allows protected route children for authorized roles", () => {
    setAuthState(authUser(ROLE_CODE.GIOF_GESTOR));

    render(
      <RouteAccessGuard>
        <div>payment content</div>
      </RouteAccessGuard>,
    );

    expect(screen.getByText("payment content")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it.each([ROLE_CODE.AUDITOR_DIRECCION, ROLE_CODE.ADMIN_SISTEMA])(
    "allows readiness issuer role %s to open management",
    (role) => {
      mockUsePathname.mockReturnValue("/management");
      setAuthState(authUser(role));

      render(
        <RouteAccessGuard>
          <div>readiness operations</div>
        </RouteAccessGuard>,
      );

      expect(screen.getByText("readiness operations")).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    },
  );

  it("does not apply role matrix to authenticated unlisted routes", () => {
    mockUsePathname.mockReturnValue("/profile");
    setAuthState(authUser(ROLE_CODE.SOLICITANTE_EPE));

    render(
      <RouteAccessGuard>
        <div>profile content</div>
      </RouteAccessGuard>,
    );

    expect(screen.getByText("profile content")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
