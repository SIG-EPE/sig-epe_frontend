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

/** Shape returned directly by GET /auth/me (after TransformInterceptor unwrap) */
interface MeResponseRaw {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  epeDni: string | null;
  onboardingCompleted: boolean;
  roles: { code: string; name: string }[];
  authSource?: 'LOCAL' | 'EPE';
}

export function useAuthHydration() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const setAuth = useAuthStore((state) => state.setAuth);
  const setLoading = useAuthStore((state) => state.setLoading);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  useEffect(() => {
    // Read token from cookie (available both when store is empty and when
    // pre-hydrated from SSR with accessToken: null)
    function getTokenFromCookie(): string | null {
      if (typeof document === "undefined") return null;
      const match = document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
      return match ? match[1] : null;
    }

    // Already hydrated with a token in memory — nothing to do
    if (user && useAuthStore.getState().accessToken) {
      setLoading(false);
      return;
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
          // Map backend shape → AuthUser shape
          const mappedUser: AuthUser = {
            id: raw.id,
            firstName: raw.firstName ?? "",
            lastName: raw.lastName ?? "",
            email: raw.email,
            documentNumber: raw.epeDni ?? "",
            onboardingCompleted: raw.onboardingCompleted,
            role: raw.roles?.[0] ?? { code: "", name: "" },
            authSource: raw.authSource ?? "LOCAL",
          };
          // Reuse cookie token — /auth/me does not issue a new one
          setAuth(mappedUser, cookieToken);
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
