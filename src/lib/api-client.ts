import type { ApiResponse, ApiError } from "@/types/api";
import { useAuthStore } from "@/stores/auth-store";
import { clearClientAuthSession } from "@/lib/auth/session-sync";
import { refreshSession } from "@/lib/auth/refresh-session";

// -------------------------------------------------------
// API Client — SIG-EPE
// Fetch wrapper with auth headers + 401 refresh logic
// -------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const AUTH_HEADER_EXCLUDED_PATHS = [
  "/auth/login",
  "/auth/logout",
  "/auth/refresh",
  "/auth/sso",
] as const;

function shouldAttachAuthHeader(path: string): boolean {
  return !AUTH_HEADER_EXCLUDED_PATHS.some((excludedPath) =>
    path.startsWith(excludedPath),
  );
}

/** Thrown on API errors so callers can inspect status + body */
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public body: ApiError,
  ) {
    super(typeof body.message === "string" ? body.message : body.message[0]);
    this.name = "ApiRequestError";
  }
}

/**
 * Core fetch function with auth + refresh logic.
 */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const { accessToken } = useAuthStore.getState();

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (
    accessToken &&
    shouldAttachAuthHeader(path) &&
    !headers.has("Authorization")
  ) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include", // always send cookies (for refresh)
  });

  // --- 401: attempt token refresh + retry ---
  if (res.status === 401 && shouldAttachAuthHeader(path)) {
    const refreshResult = await refreshSession({ reason: "api-401" }).catch(() => null);
    const newToken = refreshResult?.accessToken ?? null;

    if (newToken) {
      // Retry original request with new token
      headers.set("Authorization", `Bearer ${newToken}`);
      const retryRes = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
        credentials: "include",
      });

      if (!retryRes.ok) {
        const errorBody = (await retryRes.json().catch(() => ({
          statusCode: retryRes.status,
          message: retryRes.statusText,
          error: "Error",
          timestamp: new Date().toISOString(),
          path,
        }))) as ApiError;
        throw new ApiRequestError(retryRes.status, errorBody);
      }

      const retryJson = (await retryRes.json()) as ApiResponse<T>;
      return retryJson.data;
    }

    // Refresh failed — clear auth + redirect to login
    clearClientAuthSession();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new ApiRequestError(401, {
      statusCode: 401,
      message: "Session expired",
      error: "Unauthorized",
      timestamp: new Date().toISOString(),
      path,
    });
  }

  // --- Non-401 errors ---
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({
      statusCode: res.status,
      message: res.statusText,
      error: "Error",
      timestamp: new Date().toISOString(),
      path,
    }))) as ApiError;
    throw new ApiRequestError(res.status, errorBody);
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  const json = (await res.json()) as ApiResponse<T>;
  return json.data;
}

// -------------------------------------------------------
// Public API methods
// -------------------------------------------------------

export const api = {
  get<T>(path: string, options?: RequestInit): Promise<T> {
    return apiFetch<T>(path, { ...options, method: "GET" });
  },

  post<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return apiFetch<T>(path, {
      ...options,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  postForm<T>(path: string, body: FormData, options?: RequestInit): Promise<T> {
    return apiFetch<T>(path, {
      ...options,
      method: "POST",
      body,
    });
  },

  patch<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return apiFetch<T>(path, {
      ...options,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(path: string, body?: unknown, options?: RequestInit): Promise<T> {
    return apiFetch<T>(path, {
      ...options,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(path: string, options?: RequestInit): Promise<T> {
    return apiFetch<T>(path, { ...options, method: "DELETE" });
  },
};
