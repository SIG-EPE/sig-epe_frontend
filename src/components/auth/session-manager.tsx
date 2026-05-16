"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { api, ApiRequestError } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import { refreshSession } from "@/lib/auth/refresh-session";
import {
  clearClientAuthSession,
  getAccessTokenFromCookie,
  normalizeAuthUser,
} from "@/lib/auth/session-sync";
import { useAuthStore } from "@/stores/auth-store";
import type { LoginResponse } from "@/types/auth";

const PROACTIVE_REFRESH_WINDOW_MS = 60 * 1000;
const MIN_REFRESH_DELAY_MS = 5 * 1000;
const MAX_REFRESH_DELAY_MS = 2_147_483_647;

type MeResponseRaw = LoginResponse["user"];

function getRefreshDelay(accessTokenExpiresAt: string | null): number {
  if (!accessTokenExpiresAt) return MIN_REFRESH_DELAY_MS;

  const expiresAt = new Date(accessTokenExpiresAt).getTime();
  if (Number.isNaN(expiresAt)) return MIN_REFRESH_DELAY_MS;

  return Math.min(
    Math.max(expiresAt - Date.now() - PROACTIVE_REFRESH_WINDOW_MS, 0),
    MAX_REFRESH_DELAY_MS,
  );
}

function isAccessNearExpiry(accessTokenExpiresAt: string | null): boolean {
  if (!accessTokenExpiresAt) return true;

  const expiresAt = new Date(accessTokenExpiresAt).getTime();
  if (Number.isNaN(expiresAt)) return true;

  return expiresAt - Date.now() <= PROACTIVE_REFRESH_WINDOW_MS;
}

export function SessionManager({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const accessTokenExpiresAt = useAuthStore((state) => state.accessTokenExpiresAt);
  const setAuth = useAuthStore((state) => state.setAuth);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSession() {
      if (user && accessToken) {
        setLoading(false);
        return;
      }

      const cookieToken = getAccessTokenFromCookie();

      if (!cookieToken) {
        try {
          await refreshSession({ reason: "hydrate" });
        } catch {
          if (!cancelled) {
            clearClientAuthSession();
            router.replace(ROUTES.LOGIN);
          }
        }
        return;
      }

      if (user?.id) {
        setAuth(user, cookieToken);
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

        if (error instanceof ApiRequestError && error.status === 401) {
          try {
            await refreshSession({ reason: "hydrate" });
          } catch {
            clearClientAuthSession();
            router.replace(ROUTES.LOGIN);
          }
        } else {
          setLoading(false);
        }
      }
    }

    hydrateSession();

    return () => {
      cancelled = true;
    };
  }, [accessToken, router, setAuth, setLoading, user]);

  useEffect(() => {
    if (!user) return undefined;

    const timer = window.setTimeout(() => {
      refreshSession({ reason: "proactive" }).catch(() => {
        clearClientAuthSession();
        router.replace(ROUTES.LOGIN);
      });
    }, Math.max(getRefreshDelay(accessTokenExpiresAt), MIN_REFRESH_DELAY_MS));

    return () => window.clearTimeout(timer);
  }, [accessTokenExpiresAt, router, user]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (!useAuthStore.getState().user) return;
      if (!isAccessNearExpiry(useAuthStore.getState().accessTokenExpiresAt)) return;

      refreshSession({ reason: "proactive" }).catch(() => {
        clearClientAuthSession();
        router.replace(ROUTES.LOGIN);
      });
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [router]);

  return <>{children}</>;
}
