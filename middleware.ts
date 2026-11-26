import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE_NAME = "admin_session";

function getJwtSecret(): Uint8Array {
  const secret =
    process.env.JWT_SECRET ||
    process.env.INTERNAL_API_KEY ||
    process.env.ADMIN_PASSWORD ||
    "sarvam-ai-calling-agent-super-secret-key-change-in-production";
  return new TextEncoder().encode(secret);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const cookie = req.cookies.get(SESSION_COOKIE_NAME);

  let isAuthenticated = false;

  if (cookie?.value) {
    try {
      const secret = getJwtSecret();
      await jwtVerify(cookie.value, secret);
      isAuthenticated = true;
    } catch {
      isAuthenticated = false;
    }
  }

  // Redirect root path to dashboard or login
  if (pathname === "/") {
    const redirectUrl = isAuthenticated ? "/dashboard" : "/login";
    return NextResponse.redirect(new URL(redirectUrl, req.url));
  }

  // Protect /dashboard routes
  if (pathname.startsWith("/dashboard")) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // If already logged in, redirect away from /login to /dashboard
  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api routes (handled individually)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, images, svg, fonts
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
