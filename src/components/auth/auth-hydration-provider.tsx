"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { useAuthStore } from "@/stores/auth-store";
import { api, ApiRequestError } from "@/lib/api-client";
import type { AuthUser } from "@/types/auth";

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

/** Shape returned directly by GET /auth/me (after TransformInterceptor unwrap) */
interface MeResponseRaw {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  epeDni: string | null;
  authSource: string;
  onboardingCompleted: boolean;
  roles: { code: string; name: string }[];
}

function getTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  return match ? match[1] : null;
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
    // Already hydrated — nothing to do
    if (user) {
      setLoading(false);
      return;
    }

    const cookieToken = getTokenFromCookie();

    // No token — middleware handles the redirect; just stop loading
    if (!cookieToken) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function hydrate() {
      try {
        const raw = await api.get<MeResponseRaw>("/auth/me", {
          headers: { Authorization: `Bearer ${cookieToken}` },
        });

        if (!cancelled) {
          const mappedUser: AuthUser = {
            id: raw.id,
            firstName: raw.firstName ?? "",
            lastName: raw.lastName ?? "",
            email: raw.email,
            documentNumber: raw.epeDni ?? "",
            onboardingCompleted: raw.onboardingCompleted,
            authSource: (raw.authSource ?? "EPE") as "LOCAL" | "EPE",
            role: raw.roles?.[0] ?? { code: "", name: "" },
          };
          setAuth(mappedUser, cookieToken!);
        }
      } catch (error) {
        if (cancelled) return;

        // 401/403 → middleware handles it; just stop loading so UI doesn't hang
        if (
          error instanceof ApiRequestError &&
          (error.status === 401 || error.status === 403)
        ) {
          setLoading(false);
        } else {
          // Network / unexpected error — stop loading, don't redirect
          setLoading(false);
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
