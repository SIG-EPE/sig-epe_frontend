import { create } from "zustand";
import { setQueryCacheAuthNamespace, bumpQueryCacheSessionGeneration, clearQueryCache } from "@/lib/query-cache";
import type { AuthUser } from "@/types/auth";

// -------------------------------------------------------
// Auth store — Zustand 5
// access_token kept in memory only (NOT localStorage) — XSS safe
// -------------------------------------------------------

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
  sessionExpiresAt: string | null;
  isLoading: boolean;
}

interface AuthActions {
  setAuth: (
    user: AuthUser,
    token: string,
    expiries?: { accessTokenExpiresAt?: string; sessionExpiresAt?: string },
  ) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
  patchUser: (partial: Partial<AuthUser>) => void;
}

type AuthStore = AuthState & AuthActions;

function buildAuthCacheNamespace(user: AuthUser): string {
  return [user.id, user.role?.code ?? "sin-rol"].join(":");
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  accessToken: null,
  accessTokenExpiresAt: null,
  sessionExpiresAt: null,
  isLoading: true,

  setAuth: (user, accessToken, expiries) => {
    setQueryCacheAuthNamespace(buildAuthCacheNamespace(user));
    set({
      user,
      accessToken,
      accessTokenExpiresAt: expiries?.accessTokenExpiresAt ?? null,
      sessionExpiresAt: expiries?.sessionExpiresAt ?? null,
      isLoading: false,
    });
  },

  clearAuth: () => {
    clearQueryCache();
    bumpQueryCacheSessionGeneration();
    if (typeof document !== "undefined") {
      document.cookie = "access_token=; path=/; max-age=0; SameSite=Strict";
    }
    return set({
      user: null,
      accessToken: null,
      accessTokenExpiresAt: null,
      sessionExpiresAt: null,
      isLoading: false,
    });
  },

  setLoading: (isLoading) =>
    set({ isLoading }),

  patchUser: (partial) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...partial } : null,
    })),
}));
