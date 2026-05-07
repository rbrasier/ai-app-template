import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirect unauthenticated requests for /admin/* to /admin/login.
 * Session presence is detected via Better Auth's session cookie; the
 * cookie name follows Better Auth's convention `<cookiePrefix>.session_token`.
 */
export const middleware = (req: NextRequest): NextResponse => {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin") || pathname.startsWith("/admin/login")) {
    return NextResponse.next();
  }

  const sessionCookie = req.cookies
    .getAll()
    .find((c) => c.name.endsWith(".session_token") || c.name === "better-auth.session_token");

  if (!sessionCookie?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
};

export const config = {
  matcher: ["/admin/:path*"],
};
