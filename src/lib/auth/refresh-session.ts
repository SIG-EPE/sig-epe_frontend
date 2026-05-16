import type { ApiResponse } from "@/types/api";
import type { LoginResponse } from "@/types/auth";
import { clearClientAuthSession, syncAuthSession, toSessionSyncInput } from "@/lib/auth/session-sync";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const REFRESH_SESSION_REASON = {
  HYDRATE: "hydrate",
  API_401: "api-401",
  PROACTIVE: "proactive",
  INACTIVITY: "inactivity",
} as const;

type RefreshSessionReason = (typeof REFRESH_SESSION_REASON)[keyof typeof REFRESH_SESSION_REASON];

interface RefreshSessionOptions {
  reason?: RefreshSessionReason;
}

export type RefreshSessionResult = LoginResponse;

let inFlightRefreshSession: Promise<RefreshSessionResult> | null = null;

export async function refreshSession(
  _options: RefreshSessionOptions = {},
): Promise<RefreshSessionResult> {
  if (!inFlightRefreshSession) {
    inFlightRefreshSession = performRefreshSession().finally(() => {
      inFlightRefreshSession = null;
    });
  }

  return inFlightRefreshSession;
}

async function performRefreshSession(): Promise<RefreshSessionResult> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    clearClientAuthSession();
    throw new Error("Session refresh failed");
  }

  const json = (await response.json()) as ApiResponse<LoginResponse>;
  syncAuthSession(toSessionSyncInput(json.data));

  return json.data;
}
