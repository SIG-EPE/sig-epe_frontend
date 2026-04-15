import { create } from "zustand";
import type { AuthUser } from "@/types/auth";

// -------------------------------------------------------
// Auth store — Zustand 5
// access_token kept in memory only (NOT localStorage) — XSS safe
// -------------------------------------------------------

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
}

interface AuthActions {
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  accessToken: null,
  isLoading: true,

  setAuth: (user, accessToken) =>
    set({ user, accessToken, isLoading: false }),

  clearAuth: () =>
    set({ user: null, accessToken: null, isLoading: false }),

  setLoading: (isLoading) =>
    set({ isLoading }),
}));
