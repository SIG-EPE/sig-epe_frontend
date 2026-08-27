import type { ApiResponse, ApiError } from "@/types/api";
import { useAuthStore } from "@/stores/auth-store";
import { clearClientAuthSession } from "@/lib/auth/session-sync";
import { refreshSession } from "@/lib/auth/refresh-session";
import { getGiofMutationHeaders } from "@/lib/giof-work-lease-session";

// -------------------------------------------------------
// API Client — SIG-EPE
// Fetch wrapper with auth headers + 401 refresh logic
// -------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const XLSX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const XLSX_SIGNATURE = [0x50, 0x4b, 0x03, 0x04] as const;
const READINESS_CSV_HEADER =
  '"sequence","stable_id","relative_path","item_type","disposition","reason_code","reference_status","reference_details","manifest_hash"';

const AUTH_HEADER_EXCLUDED_PATHS = [
  "/auth/login",
  "/auth/logout",
  "/auth/refresh",
  "/auth/sso",
] as const;

export interface ApiDownloadResult {
  blob: Blob;
  filename: string | null;
}

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
    public headers: Headers = new Headers(),
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
  const giofHeaders = getGiofMutationHeaders(path, options.method);
  if (giofHeaders) {
    new Headers(giofHeaders).forEach((value, key) => {
      if (!headers.has(key)) headers.set(key, value);
    });
  }
  if (!headers.has("Content-Type") && typeof options.body === "string") {
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
    const refreshResult = await refreshSession({ reason: "api-401" }).catch(
      () => null,
    );
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
        throw new ApiRequestError(retryRes.status, errorBody, retryRes.headers);
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
    throw new ApiRequestError(res.status, errorBody, res.headers);
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T;
  }

  const json = (await res.json()) as ApiResponse<T>;
  return json.data;
}

function getFilenameFromContentDisposition(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1].replace(/"/g, ""));
  }

  const filenameMatch = /filename="?([^";]+)"?/i.exec(value);
  return filenameMatch?.[1] ?? null;
}

async function apiDownload(
  path: string,
  options: RequestInit = {},
  expectedMediaType: typeof XLSX_MEDIA_TYPE | "text/csv" = XLSX_MEDIA_TYPE,
): Promise<ApiDownloadResult> {
  const { accessToken } = useAuthStore.getState();

  const headers = new Headers(options.headers);
  if (
    accessToken &&
    shouldAttachAuthHeader(path) &&
    !headers.has("Authorization")
  ) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const requestOptions: RequestInit = {
    ...options,
    headers,
    credentials: "include",
  };

  let res = await fetch(`${API_URL}${path}`, requestOptions);

  if (res.status === 401 && shouldAttachAuthHeader(path)) {
    const refreshResult = await refreshSession({ reason: "api-401" }).catch(
      () => null,
    );
    const newToken = refreshResult?.accessToken ?? null;

    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      res = await fetch(`${API_URL}${path}`, requestOptions);
    } else {
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
  }

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({
      statusCode: res.status,
      message: res.statusText,
      error: "Error",
      timestamp: new Date().toISOString(),
      path,
    }))) as ApiError;
    throw new ApiRequestError(res.status, errorBody, res.headers);
  }

  const mediaType = res.headers
    .get("Content-Type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  const blob = await res.blob();
  const signature = new Uint8Array(
    await blob.slice(0, XLSX_SIGNATURE.length).arrayBuffer(),
  );
  const hasValidSignature =
    expectedMediaType === "text/csv"
      ? (await blob.text()).split(/\r?\n/, 1)[0] === READINESS_CSV_HEADER
      : signature.length === XLSX_SIGNATURE.length &&
        XLSX_SIGNATURE.every((byte, index) => signature[index] === byte);

  if (mediaType !== expectedMediaType || !hasValidSignature) {
    throw new ApiRequestError(
      200,
      {
        statusCode: 200,
        code: "INVALID_DOWNLOAD_RESPONSE",
        message: "Invalid download response",
        error: "Invalid Download Response",
        timestamp: new Date().toISOString(),
        path,
      },
      res.headers,
    );
  }

  return {
    blob,
    filename: getFilenameFromContentDisposition(
      res.headers.get("Content-Disposition"),
    ),
  };
}

// -------------------------------------------------------
// Public API methods
// -------------------------------------------------------

export const api = {
  get<T>(path: string, options?: RequestInit): Promise<T> {
    return apiFetch<T>(path, { ...options, method: "GET" });
  },

  download(path: string, options?: RequestInit): Promise<ApiDownloadResult> {
    return apiDownload(path, { ...options, method: "GET" });
  },

  downloadCsv(
    path: string,
    body: unknown,
    options?: RequestInit,
  ): Promise<ApiDownloadResult> {
    const headers = new Headers(options?.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return apiDownload(
      path,
      {
        ...options,
        method: "POST",
        body: JSON.stringify(body),
        headers,
      },
      "text/csv",
    );
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

  patchForm<T>(
    path: string,
    body: FormData,
    options?: RequestInit,
  ): Promise<T> {
    return apiFetch<T>(path, {
      ...options,
      method: "PATCH",
      body,
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
