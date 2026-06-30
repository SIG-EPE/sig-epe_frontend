import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useProfile } from "@/hooks/use-profile";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { AuthUser, BackendAuthUser } from "@/types/auth";

vi.mock("@/lib/api-client", () => ({
  api: {
    patch: vi.fn(),
  },
}));

const authUser: AuthUser = {
  id: "user-1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  documentNumber: "12345678",
  onboardingCompleted: true,
  authSource: "LOCAL",
  role: { code: "GIOF_GESTOR", name: "GIOF" },
};

const backendUser: BackendAuthUser = {
  id: "user-1",
  firstName: "Ada",
  lastName: "Byron",
  email: "ada.byron@example.com",
  epeDni: "12345678",
  onboardingCompleted: true,
  authSource: "LOCAL",
  roles: [{ code: "GIOF_GESTOR", name: "GIOF" }],
};

describe("useProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: authUser,
      accessToken: "access-token",
      accessTokenExpiresAt: null,
      sessionExpiresAt: null,
      isLoading: false,
    });
  });

  it("updates the authenticated profile through the shared API client", async () => {
    vi.mocked(api.patch).mockResolvedValueOnce(backendUser);

    const { result } = renderHook(() => useProfile());

    await act(async () => {
      await result.current.updateProfile({ lastName: "Byron" });
    });

    expect(api.patch).toHaveBeenCalledWith("/auth/me", { lastName: "Byron" });
    expect(useAuthStore.getState().user).toMatchObject({
      lastName: "Byron",
      email: "ada.byron@example.com",
      documentNumber: "12345678",
      role: { code: "GIOF_GESTOR", name: "GIOF" },
    });
  });
});
