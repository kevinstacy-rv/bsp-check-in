import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in again to keep syncing." }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (request.nextUrl.pathname !== "/") login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // Everything except the login flow, Next internals and public static files
    // (brand art, the service worker and the manifest load before sign-in).
    "/((?!login|api/login|_next/static|_next/image|brand/|sw\\.js|manifest\\.webmanifest|icon\\.svg|favicon\\.ico).*)",
  ],
};
