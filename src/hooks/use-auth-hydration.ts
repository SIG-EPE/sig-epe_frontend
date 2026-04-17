"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthStore } from "@/stores/auth-store";
import { api, ApiRequestError } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import type { AuthUser } from "@/types/auth";

// -------------------------------------------------------
// useAuthHydration — rehydrates the auth store on mount
//
// After a full page reload (e.g. login redirect via
// window.location.href), Zustand in-memory state is lost.
// This hook calls GET /auth/me with the access_token cookie
// to restore the user + token into the store.
// -------------------------------------------------------

interface MeResponse {
  user: AuthUser;
  accessToken: string;
}

export function useAuthHydration() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const setAuth = useAuthStore((state) => state.setAuth);
  const setLoading = useAuthStore((state) => state.setLoading);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  useEffect(() => {
    // Already hydrated — nothing to do
    if (user) {
      setLoading(false);
      return;
    }

    // Read token from cookie as fallback (store is empty after full page reload)
    function getTokenFromCookie(): string | null {
      if (typeof document === "undefined") return null;
      const match = document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
      return match ? match[1] : null;
    }

    let cancelled = false;

    async function hydrate() {
      const cookieToken = getTokenFromCookie();

      // No token anywhere — clear and redirect
      if (!cookieToken) {
        clearAuth();
        router.replace(ROUTES.LOGIN);
        return;
      }

      try {
        const data = await api.get<MeResponse>("/auth/me", {
          headers: { Authorization: `Bearer ${cookieToken}` },
        });
        if (!cancelled) {
          setAuth(data.user, data.accessToken);
        }
      } catch (error) {
        if (cancelled) return;

        if (error instanceof ApiRequestError && error.status === 401) {
          clearAuth();
          router.replace(ROUTES.LOGIN);
        } else {
          // Network error or unexpected — still clear loading so UI doesn't hang
          setLoading(false);
        }
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [user, setAuth, setLoading, clearAuth, router]);
}
