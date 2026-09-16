import { beforeEach, describe, expect, it } from "vitest";

import { BULK_MARK_PAID_RUN_STORAGE_PREFIX } from "@/lib/bulk-mark-paid-run-storage";
import { useAuthStore } from "../auth-store";
import type { AuthUser } from "@/types/auth";

const USER: AuthUser = {
  id: "user-1",
  firstName: "Giof",
  lastName: "Gestor",
  email: "giof@example.test",
  documentNumber: "12345678",
  role: { code: "GIOF_GESTOR", name: "GIOF Gestor" },
  onboardingCompleted: true,
  authSource: "LOCAL",
};

describe("auth scope for persisted bulk mark-paid runs", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      accessTokenExpiresAt: null,
      sessionExpiresAt: null,
      isLoading: false,
    });
  });

  it("keeps access tokens in memory and clears bulk runs when the session changes", () => {
    useAuthStore.getState().setAuth(USER, "secret-token-a", {
      sessionExpiresAt: "2026-09-15T10:00:00.000Z",
    });
    sessionStorage.setItem(
      `${BULK_MARK_PAID_RUN_STORAGE_PREFIX}old-session`,
      "persisted-run",
    );
    sessionStorage.setItem("unrelated", "retained");

    useAuthStore.getState().setAuth(USER, "secret-token-b", {
      sessionExpiresAt: "2026-09-16T10:00:00.000Z",
    });

    expect(useAuthStore.getState().accessToken).toBe("secret-token-b");
    expect(
      JSON.stringify({ ...sessionStorage, ...localStorage }),
    ).not.toContain("secret-token");
    expect(
      sessionStorage.getItem(`${BULK_MARK_PAID_RUN_STORAGE_PREFIX}old-session`),
    ).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("retained");
  });

  it("removes all bulk runs on logout without clearing unrelated session data", () => {
    useAuthStore.getState().setAuth(USER, "secret-token", {
      sessionExpiresAt: "2026-09-15T10:00:00.000Z",
    });
    sessionStorage.setItem(
      `${BULK_MARK_PAID_RUN_STORAGE_PREFIX}current-session`,
      "persisted-run",
    );
    sessionStorage.setItem("unrelated", "retained");

    useAuthStore.getState().clearAuth();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      accessToken: null,
      sessionExpiresAt: null,
    });
    expect(
      sessionStorage.getItem(
        `${BULK_MARK_PAID_RUN_STORAGE_PREFIX}current-session`,
      ),
    ).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("retained");
  });
});
