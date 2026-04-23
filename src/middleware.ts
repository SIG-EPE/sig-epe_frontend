import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import type { TokenPayload } from "@/types/auth";
import { getRoleHomePath } from "@/lib/auth/role-redirect";

// -------------------------------------------------------
// Next.js Middleware — Edge Runtime JWT verification
// Uses jose (Edge-compatible, no Node.js crypto dependency)
// -------------------------------------------------------

const PUBLIC_PATHS = ["/_next", "/favicon.ico", "/api/health"];

// Routes that require specific roles — checked after token verification
const ROUTE_ROLE_REQUIREMENTS: Record<string, string[]> = {
  "/admin/users": ["ADMIN_SISTEMA", "GIOF_GESTOR"],
  "/admin/config": ["ADMIN_SISTEMA"],
  "/admin/audit-logs": ["ADMIN_SISTEMA"],
};

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static/infra paths through without any token check
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get("access_token")?.value;

  // /login: if the user already has a valid token, redirect to the appropriate destination
  if (pathname === "/login") {
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

  // Protected routes: require a valid token
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const tokenPayload = await verifyToken(token);

  if (!tokenPayload) {
    // Invalid / expired token → redirect to login
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
    for (const [route, allowedRoles] of Object.entries(ROUTE_ROLE_REQUIREMENTS)) {
      if (pathname.startsWith(route)) {
        if (!allowedRoles.includes(tokenPayload.role)) {
          const homePath = getRoleHomePath(tokenPayload.role) ?? "/dashboard";
          return NextResponse.redirect(new URL(homePath, request.url));
        }
        break;
      }
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
