import { canAccessRoute, getRouteAccessRule } from "@/lib/auth/route-access";
import { getRoleHomePath } from "@/lib/auth/role-redirect";
import { ROUTES } from "@/lib/constants";

const MAX_RETURN_TO_LENGTH = 2048;
const RETURN_TO_BASE_URL = "https://return-to.invalid";
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const ENCODED_CONTROL_CHARACTER_PATTERN = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i;
const DOUBLE_ENCODED_BYTE_PATTERN = /%25[0-9a-f]{2}/i;
const MALFORMED_PERCENT_ESCAPE_PATTERN = /%(?![0-9a-f]{2})/i;

const LOGIN_REASON = {
  INACTIVIDAD: "inactividad",
  INACTIVITY: "inactivity",
} as const;

type LoginReason = (typeof LOGIN_REASON)[keyof typeof LOGIN_REASON];

function sanitizeLoginReason(reason: string | null | undefined): LoginReason | null {
  return Object.values(LOGIN_REASON).includes(reason as LoginReason)
    ? (reason as LoginReason)
    : null;
}

export function sanitizeReturnTo(candidate: string | null | undefined): string | null {
  if (!candidate || candidate.length > MAX_RETURN_TO_LENGTH) return null;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return null;
  if (candidate.includes("\\") || candidate.includes("#")) return null;
  if (
    CONTROL_CHARACTER_PATTERN.test(candidate)
    || ENCODED_CONTROL_CHARACTER_PATTERN.test(candidate)
    || DOUBLE_ENCODED_BYTE_PATTERN.test(candidate)
    || MALFORMED_PERCENT_ESCAPE_PATTERN.test(candidate)
  ) {
    return null;
  }

  const queryIndex = candidate.indexOf("?");
  const rawPathname = queryIndex === -1 ? candidate : candidate.slice(0, queryIndex);

  let parsed: URL;
  try {
    parsed = new URL(candidate, RETURN_TO_BASE_URL);
  } catch {
    return null;
  }

  if (parsed.origin !== RETURN_TO_BASE_URL || parsed.username || parsed.password) return null;
  if (parsed.pathname !== rawPathname) return null;
  if (
    parsed.pathname === ROUTES.LOGIN
    || parsed.pathname.startsWith(`${ROUTES.LOGIN}/`)
    || parsed.pathname === ROUTES.ONBOARDING
    || parsed.pathname.startsWith(`${ROUTES.ONBOARDING}/`)
    || parsed.pathname.startsWith("/api/")
    || parsed.pathname.startsWith("/_next/")
  ) {
    return null;
  }
  if (!getRouteAccessRule(parsed.pathname)) return null;

  return `${parsed.pathname}${parsed.search}`;
}

export function buildLoginPath(input: {
  returnTo?: string | null;
  reason?: string | null;
} = {}): string {
  const params = new URLSearchParams();
  const returnTo = sanitizeReturnTo(input.returnTo);
  const reason = sanitizeLoginReason(input.reason);

  if (returnTo) params.set("returnTo", returnTo);
  if (reason) params.set("reason", reason);

  const search = params.toString();
  return search ? `${ROUTES.LOGIN}?${search}` : ROUTES.LOGIN;
}

export function buildLoginPathForCurrentLocation(
  reason?: string | null,
): string {
  const returnTo = typeof window === "undefined"
    ? null
    : `${window.location.pathname}${window.location.search}`;
  return buildLoginPath({ returnTo, reason });
}

export function buildOnboardingPath(returnTo?: string | null): string {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  if (!safeReturnTo) return ROUTES.ONBOARDING;

  const params = new URLSearchParams({ returnTo: safeReturnTo });
  return `${ROUTES.ONBOARDING}?${params.toString()}`;
}

export function resolvePostAuthDestination(
  returnTo: string | null | undefined,
  roleCode: string,
): string {
  const safeReturnTo = sanitizeReturnTo(returnTo);
  if (!safeReturnTo) return getRoleHomePath(roleCode);

  const { pathname } = new URL(safeReturnTo, RETURN_TO_BASE_URL);
  return canAccessRoute(pathname, roleCode).isAllowed
    ? safeReturnTo
    : getRoleHomePath(roleCode);
}
