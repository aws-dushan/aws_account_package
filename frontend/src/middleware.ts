import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, decodeJwt, claimsToUser } from "./lib/jwt";

/**
 * Route protection using the httpOnly JWT cookie from the .NET API. Edge-safe: the token
 * is only base64-decoded (not verified) to gate navigation; the API verifies every call.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const claims = decodeJwt(token);
  const user = claims ? claimsToUser(claims) : null;

  const onLogin = pathname.startsWith("/login");
  const onChangePw = pathname.startsWith("/change-password");

  if (!user) {
    if (onLogin) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Logged in but must change password → force them there first.
  if (user.mustChangePassword && !onChangePw) {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  // Already authenticated → keep them out of the login page.
  if (onLogin) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except API routes, Next internals, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo).*)"],
};
