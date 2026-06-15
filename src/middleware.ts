import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import type { TokenPayload } from "@/types/auth";
import { getRoleHomePath } from "@/lib/auth/role-redirect";
import { canAccessRoute, getRouteAccessRule } from "@/lib/auth/route-access";

// -------------------------------------------------------
// Next.js Middleware — Edge Runtime JWT verification
// Uses jose (Edge-compatible, no Node.js crypto dependency)
// -------------------------------------------------------

const PUBLIC_PATHS = ["/_next", "/favicon.ico", "/api/health"];
const SESSION_HINT_COOKIE_NAME = "session_hint" as const;

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

function canUseSessionHintForPath(pathname: string): boolean {
  return pathname === "/" || Boolean(getRouteAccessRule(pathname));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static/infra paths through without any token check
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get("access_token")?.value;
  const hasSessionContinuity = request.cookies.get(SESSION_HINT_COOKIE_NAME)?.value === "present";

  // /login: if the user already has a valid token, redirect to the appropriate destination
  if (pathname === "/login") {
    if (request.nextUrl.searchParams.has("token")) {
      return NextResponse.next();
    }

    if (token) {
      const tokenPayload = await verifyToken(token);
      if (tokenPayload?.scope === "full") {
        return NextResponse.redirect(new URL(getRoleHomePath(tokenPayload.role), request.url));
      }
      if (tokenPayload?.scope === "onboarding") {
        return NextResponse.redirect(new URL("/onboarding", request.url));
      }
    }
    // No token or invalid token → show login page
    return NextResponse.next();
  }

  // Protected routes: a valid access token is authoritative. If it is missing
  // or expired, a non-sensitive session hint may admit only the protected shell;
  // AuthGate/RoleGuard and backend APIs make the final auth decision.
  if (!token) {
    if (hasSessionContinuity && canUseSessionHintForPath(pathname)) {
      return NextResponse.next();
    }

    return NextResponse.redirect(new URL("/login", request.url));
  }

  const tokenPayload = await verifyToken(token);

  if (!tokenPayload) {
    if (hasSessionContinuity && canUseSessionHintForPath(pathname)) {
      return NextResponse.next();
    }

    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Onboarding scope: only allow /onboarding
  if (tokenPayload.scope === "onboarding" && !pathname.startsWith("/onboarding")) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  // Full scope: redirect away from /onboarding
  if (tokenPayload.scope === "full" && pathname.startsWith("/onboarding")) {
    return NextResponse.redirect(new URL(getRoleHomePath(tokenPayload.role), request.url));
  }

  // Redirect root "/" to role-specific home page
  if (pathname === "/" && tokenPayload.scope === "full") {
    return NextResponse.redirect(new URL(getRoleHomePath(tokenPayload.role), request.url));
  }

  // Role-based route protection — check after scope logic
  if (tokenPayload.scope === "full") {
    const access = canAccessRoute(pathname, tokenPayload.role);

    if (access.isProtectedRoute && !access.isAllowed) {
      return NextResponse.redirect(new URL(getRoleHomePath(tokenPayload.role), request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - public static assets (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:webp|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|otf)).*)",
  ],
};
