import { useAuthStore } from "@/stores/auth-store";
import { TOKEN_KEY } from "@/lib/constants";
import type { AuthUser, BackendAuthUser, LoginResponse } from "@/types/auth";

interface SyncAuthSessionInput {
  accessToken: string;
  accessTokenExpiresAt?: string;
  user?: BackendAuthUser;
}

const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
const ACCESS_TOKEN_CLEAR_PATHS = ["/", "/login", "/auth", "/auth/"] as const;

function getCookieDomainCandidates(): string[] {
  if (typeof window === "undefined") return [];

  const hostname = window.location.hostname;
  if (!hostname || hostname === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    return [];
  }

  return [hostname, `.${hostname}`];
}

function expireCookie(name: string, path: string, domain?: string): void {
  const domainAttribute = domain ? `; domain=${domain}` : "";
  document.cookie = `${name}=; path=${path}${domainAttribute}; max-age=0; SameSite=Strict`;
  document.cookie = `${name}=; path=${path}${domainAttribute}; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

export function getAccessTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${TOKEN_KEY}=([^;]+)`),
  );

  return match ? decodeURIComponent(match[1]) : null;
}

export function clearAccessTokenCookie(): void {
  if (typeof document === "undefined") return;

  const domainCandidates = getCookieDomainCandidates();

  for (const path of ACCESS_TOKEN_CLEAR_PATHS) {
    expireCookie(TOKEN_KEY, path);

    for (const domain of domainCandidates) {
      expireCookie(TOKEN_KEY, path, domain);
    }
  }
}

export function clearClientAuthSession(): void {
  clearAccessTokenCookie();
  useAuthStore.getState().clearAuth();
}

export function normalizeAuthUser(user: BackendAuthUser): AuthUser {
  return {
    id: user.id,
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    email: user.email,
    documentNumber: user.epeDni ?? "",
    onboardingCompleted: user.onboardingCompleted,
    authSource: user.authSource ?? "LOCAL",
    role: user.roles?.[0] ?? user.role,
  };
}

export function getAccessTokenMaxAge(
  accessTokenExpiresAt?: string,
  now = Date.now(),
): number {
  if (!accessTokenExpiresAt) return ACCESS_TOKEN_MAX_AGE_SECONDS;

  const expiresAt = new Date(accessTokenExpiresAt).getTime();
  if (Number.isNaN(expiresAt)) return ACCESS_TOKEN_MAX_AGE_SECONDS;

  const maxAge = Math.floor((expiresAt - now) / 1000);
  return maxAge > 0 ? maxAge : 0;
}

export function writeAccessTokenCookie(
  accessToken: string,
  accessTokenExpiresAt?: string,
): void {
  if (typeof document === "undefined") return;

  clearAccessTokenCookie();

  const maxAge = getAccessTokenMaxAge(accessTokenExpiresAt);
  document.cookie = `${TOKEN_KEY}=${encodeURIComponent(accessToken)}; path=/; SameSite=Strict; Max-Age=${maxAge}`;
}

export function syncAuthSession({
  accessToken,
  accessTokenExpiresAt,
  user,
}: SyncAuthSessionInput): void {
  writeAccessTokenCookie(accessToken, accessTokenExpiresAt);

  if (user) {
    useAuthStore.getState().setAuth(normalizeAuthUser(user), accessToken);
    return;
  }

  const currentUser = useAuthStore.getState().user;
  if (currentUser) {
    useAuthStore.getState().setAuth(currentUser, accessToken);
  }
}

export function toSessionSyncInput(data: LoginResponse): SyncAuthSessionInput {
  return {
    accessToken: data.accessToken,
    accessTokenExpiresAt: data.accessTokenExpiresAt,
    user: data.user,
  };
}
