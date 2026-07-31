import type { LoginResponse } from "@/types/auth";

interface SsoApi {
  get<T>(path: string, options?: RequestInit): Promise<T>;
}

const FLIGHTS_SYMBOL = Symbol.for("sig-epe.sso-flight-promises");
const flightStore = globalThis as typeof globalThis &
  Record<symbol, Map<string, Promise<LoginResponse>> | undefined>;
const flights =
  flightStore[FLIGHTS_SYMBOL] ?? new Map<string, Promise<LoginResponse>>();
flightStore[FLIGHTS_SYMBOL] = flights;
const TRANSIENT_RETRY_DELAY_MS = 150;
const MAX_RETRY_AFTER_MS = 5_000;

function createExchangeId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000"
  );
}

export function stripSsoTokenFromHistory(): void {
  if (typeof window === "undefined") return;

  // Next App Router patches window.history.replaceState and merges its route
  // tree, which still contains the original `?token=...`. Call the native
  // implementation so neither the visible URL nor history.state retains it.
  History.prototype.replaceState.call(window.history, null, "", "/login");
}

export function startSsoExchange(
  token: string,
  api: SsoApi,
): Promise<LoginResponse> {
  stripSsoTokenFromHistory();

  let flight = flights.get(token);
  if (!flight) {
    const exchangeId = createExchangeId();
    flight = requestWithRecovery(token, exchangeId, api);
    flights.set(token, flight);
  }

  return flight;
}

async function requestWithRecovery(
  token: string,
  exchangeId: string,
  api: SsoApi,
): Promise<LoginResponse> {
  const options: RequestInit = {
    headers: {
      "Idempotency-Key": exchangeId,
      "X-Request-Id": createExchangeId(),
    },
  };
  const path = `/auth/sso?token=${encodeURIComponent(token)}`;

  try {
    return await api.get<LoginResponse>(path, options);
  } catch (error: unknown) {
    if (!isTransientSsoError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, getRetryDelayMs(error)));
    return api.get<LoginResponse>(path, options);
  }
}

function isTransientSsoError(error: unknown): boolean {
  if (error instanceof TypeError) return true;

  if (typeof error !== "object" || error === null || !("status" in error)) {
    return false;
  }

  const status = (error as { status?: unknown }).status;
  const code = (error as { body?: { code?: unknown } }).body?.code;
  return (
    status === 503 ||
    (status === 409 && code === "SSO_BUSY")
  );
}

function getRetryDelayMs(error: unknown): number {
  if (typeof error !== "object" || error === null || !("headers" in error)) {
    return TRANSIENT_RETRY_DELAY_MS;
  }

  const headers = (error as { headers?: unknown }).headers;
  if (!(headers instanceof Headers)) return TRANSIENT_RETRY_DELAY_MS;

  const retryAfter = headers.get("Retry-After")?.trim();
  if (!retryAfter) return TRANSIENT_RETRY_DELAY_MS;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS);
  }

  const retryAt = Date.parse(retryAfter);
  if (Number.isNaN(retryAt)) return TRANSIENT_RETRY_DELAY_MS;
  return Math.min(Math.max(retryAt - Date.now(), 0), MAX_RETRY_AFTER_MS);
}

export function resetSsoExchangeStateForTests(): void {
  flights.clear();
}
