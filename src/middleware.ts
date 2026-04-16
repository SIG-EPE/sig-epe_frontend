import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import type { TokenPayload } from "@/types/auth";

// -------------------------------------------------------
// Next.js Middleware — Edge Runtime JWT verification
// Uses jose (Edge-compatible, no Node.js crypto dependency)
// -------------------------------------------------------

const PUBLIC_PATHS = ["/login", "/_next", "/favicon.ico", "/api/health"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Read token from cookie
  const token = request.cookies.get("access_token")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_ACCESS_SECRET,
    );

    const { payload } = await jwtVerify(token, secret);
    const tokenPayload = payload as unknown as TokenPayload;

    // Onboarding scope: only allow /onboarding
    if (
      tokenPayload.scope === "onboarding" &&
      !pathname.startsWith("/onboarding")
    ) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }

    // Full scope: redirect away from /onboarding and /login
    if (tokenPayload.scope === "full") {
      if (pathname.startsWith("/onboarding")) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
      if (pathname === "/login") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }

    return NextResponse.next();
  } catch {
    // Invalid / expired token → redirect to login
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
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
