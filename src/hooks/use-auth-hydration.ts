"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@/stores/auth-store";
import { api, ApiRequestError } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import type { LoginResponse } from "@/types/auth";
import {
  getAccessTokenFromCookie,
  normalizeAuthUser,
  syncAuthSession,
  toSessionSyncInput,
} from "@/lib/auth/session-sync";

// -------------------------------------------------------
// useAuthHydration — rehydrates the auth store on mount
//
// After a full page reload (e.g. login redirect via
// window.location.href), Zustand in-memory state is lost.
// This hook calls GET /auth/me with the access_token cookie
// to restore the user + token into the store.
// -------------------------------------------------------

type MeResponseRaw = LoginResponse["user"];

function clearSessionCookiesInBrowser(): void {
  if (typeof document === "undefined") return;

  for (const name of ["access_token", "refresh_token"]) {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Strict`;
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  }
}

export function useAuthHydration() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const setAuth = useAuthStore((state) => state.setAuth);
  const setLoading = useAuthStore((state) => state.setLoading);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  useEffect(() => {
    // Already hydrated with a token in memory — nothing to do
    if (user && useAuthStore.getState().accessToken) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function hydrate() {
      const cookieToken = getAccessTokenFromCookie();

      // No access cookie — try refresh continuity before redirecting
      if (!cookieToken) {
        try {
          const refreshed = await api.post<LoginResponse>("/auth/refresh", {});

          if (cancelled) return;

          syncAuthSession(toSessionSyncInput(refreshed));
          return;
        } catch {
          if (!cancelled) {
            clearSessionCookiesInBrowser();
            clearAuth();
            router.replace(ROUTES.LOGIN);
          }
          return;
        }
      }

      // SSR pre-hydrated the user but not the token (server can't expose the
      // token to client memory directly). Reuse the cookie token and skip the
      // /auth/me call to avoid an extra round-trip.
      // Guard: only trust the SSR user if it has a valid id (guards against
      // broken SSR mapping where fields are undefined/empty).
      if (user && user.id) {
        if (!cancelled) {
          setAuth(user, cookieToken);
        }
        return;
      }

      try {
        // /auth/me returns user data directly (not wrapped in { user, accessToken })
        const raw = await api.get<MeResponseRaw>("/auth/me", {
          headers: { Authorization: `Bearer ${cookieToken}` },
        });

        if (!cancelled) {
          setAuth(normalizeAuthUser(raw), cookieToken);
        }
      } catch (error) {
        if (cancelled) return;

        if (error instanceof ApiRequestError && error.status === 401) {
          try {
            const refreshed = await api.post<LoginResponse>("/auth/refresh", {});

            if (cancelled) return;

            syncAuthSession(toSessionSyncInput(refreshed));
          } catch {
            if (!cancelled) {
              clearSessionCookiesInBrowser();
              clearAuth();
              router.replace(ROUTES.LOGIN);
            }
          }
        } else {
          // Network error or unexpected — still clear loading so UI doesn't hang
          if (!cancelled) {
            setLoading(false);
          }
        }
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [user, setAuth, setLoading, clearAuth, router]);
}
