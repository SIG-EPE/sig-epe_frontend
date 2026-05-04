import { beforeEach, describe, expect, it } from "vitest";

import {
  getAccessTokenMaxAge,
  normalizeAuthUser,
  syncAuthSession,
} from "@/lib/auth/session-sync";
import { useAuthStore } from "@/stores/auth-store";

describe("session-sync", () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, isLoading: true });
    document.cookie = "access_token=; path=/; max-age=0; SameSite=Strict";
  });

  it("normalizes backend auth users into store shape", () => {
    expect(
      normalizeAuthUser({
        id: "user-1",
        firstName: "Ada",
        lastName: null,
        email: "ada@example.com",
        epeDni: "12345678",
        onboardingCompleted: true,
        authSource: "EPE",
        roles: [{ code: "SOLICITANTE_EPE", name: "Solicitante EPE" }],
      }),
    ).toEqual({
      id: "user-1",
      firstName: "Ada",
      lastName: "",
      email: "ada@example.com",
      documentNumber: "12345678",
      onboardingCompleted: true,
      authSource: "EPE",
      role: { code: "SOLICITANTE_EPE", name: "Solicitante EPE" },
    });
  });

  it("computes cookie max-age from backend expiry metadata", () => {
    const now = new Date("2026-05-03T16:00:00.000Z").getTime();
    expect(getAccessTokenMaxAge("2026-05-03T16:15:00.000Z", now)).toBe(900);
  });

  it("syncs the access cookie and Zustand store from one path", () => {
    syncAuthSession({
      accessToken: "token-123",
      accessTokenExpiresAt: "2099-01-01T00:15:00.000Z",
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

    const state = useAuthStore.getState();
    expect(state.accessToken).toBe("token-123");
    expect(state.user?.role?.code).toBe("ADMIN_SISTEMA");
    expect(document.cookie).toContain("access_token=token-123");
  });

  it("removes stale path-specific access cookies before writing the new token", () => {
    window.history.replaceState(null, "", "/login?token=sso-token");
    document.cookie = "access_token=old-admin-token; path=/login; SameSite=Strict";

    syncAuthSession({
      accessToken: "new-sso-token",
      accessTokenExpiresAt: "2099-01-01T00:15:00.000Z",
      user: {
        id: "user-2",
        firstName: "Grace",
        lastName: "Hopper",
        email: "grace@example.com",
        epeDni: "87654321",
        onboardingCompleted: true,
        authSource: "EPE",
        roles: [{ code: "SOLICITANTE_EPE", name: "Solicitante" }],
      },
    });

    expect(document.cookie).toContain("access_token=new-sso-token");
    expect(document.cookie).not.toContain("old-admin-token");
  });

  it("reuses the current user when refresh only returns a new token", () => {
    useAuthStore.getState().setAuth(
      {
        id: "user-1",
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        documentNumber: "12345678",
        onboardingCompleted: true,
        authSource: "LOCAL",
        role: { code: "ADMIN_SISTEMA", name: "Admin" },
      },
      "old-token",
    );

    syncAuthSession({
      accessToken: "new-token",
      accessTokenExpiresAt: "2099-01-01T00:15:00.000Z",
    });

    expect(useAuthStore.getState().accessToken).toBe("new-token");
    expect(useAuthStore.getState().user?.id).toBe("user-1");
  });
});
