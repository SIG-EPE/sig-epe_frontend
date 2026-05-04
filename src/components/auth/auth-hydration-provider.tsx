"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { useAuthStore } from "@/stores/auth-store";
import { api, ApiRequestError } from "@/lib/api-client";
import type { LoginResponse } from "@/types/auth";
import {
  getAccessTokenFromCookie,
  normalizeAuthUser,
  syncAuthSession,
  toSessionSyncInput,
} from "@/lib/auth/session-sync";

// -------------------------------------------------------
// AuthHydrationProvider
//
// Wraps (auth) routes (e.g. /onboarding) to rehydrate the
// Zustand auth store on full page reloads.
//
// Strategy:
//   1. Read the access_token from the cookie (set by login/refresh)
//   2. Call GET /auth/me to restore user + token in the store
//   3. Render a spinner while loading; children once hydrated
//
// Errors:
//   - 401 → do nothing; middleware already handles the redirect
//   - No cookie → do nothing; middleware already handles it
//   - Network error → set isLoading=false so UI doesn't hang
// -------------------------------------------------------

type MeResponseRaw = LoginResponse["user"];

function clearSessionCookiesInBrowser(): void {
  if (typeof document === "undefined") return;

  for (const name of ["access_token", "refresh_token"]) {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Strict`;
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  }
}

function isSsoLoginRequest(): boolean {
  if (typeof window === "undefined") return false;

  const { pathname, search } = window.location;
  return pathname === "/login" && new URLSearchParams(search).has("token");
}

export function AuthHydrationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const setAuth = useAuthStore((state) => state.setAuth);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    let cancelled = false;

    // SSO handoff owns session cleanup and token exchange. Do not silently
    // refresh a previous browser session here, or an old user can win the race.
    if (isSsoLoginRequest()) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    // Already hydrated — nothing to do
    if (user) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    async function hydrate() {
      const cookieToken = getAccessTokenFromCookie();

      // No access cookie — try refresh continuity before giving up
      if (!cookieToken) {
        try {
          const refreshData = await api.post<LoginResponse>("/auth/refresh", {});

          if (cancelled) return;

          syncAuthSession(toSessionSyncInput(refreshData));
        } catch {
          if (!cancelled) {
            clearSessionCookiesInBrowser();
            setLoading(false);
          }
        }

        return;
      }

      try {
        const raw = await api.get<MeResponseRaw>("/auth/me", {
          headers: { Authorization: `Bearer ${cookieToken}` },
        });

        if (!cancelled) {
          setAuth(normalizeAuthUser(raw), cookieToken);
        }
      } catch (error) {
        if (cancelled) return;

        // 401 → try silent refresh before giving up
        if (error instanceof ApiRequestError && error.status === 401) {
          try {
            // Browser automatically sends the httpOnly refresh_token cookie
            const refreshData = await api.post<LoginResponse>(
              "/auth/refresh",
              {},
            );

            if (cancelled) return;

            syncAuthSession(toSessionSyncInput(refreshData));
          } catch {
            // Refresh also failed — session truly expired; middleware redirects
            if (!cancelled) {
              clearSessionCookiesInBrowser();
              setLoading(false);
            }
          }
        } else {
          // 403 / network / unexpected error — stop loading, don't redirect
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
  }, [user, setAuth, setLoading]);

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
