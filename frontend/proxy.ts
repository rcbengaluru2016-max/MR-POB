import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/server/session-token";
import { ACCESS_COOKIE, backendEnabled, backendUser } from "@/lib/server/backend-client";
import { backendApi } from "@/lib/server/backend-api";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (backendEnabled() && pathname.startsWith("/api/")) return backendApi(request);
  const session = backendEnabled()
    ? await backendUser(request.cookies.get(ACCESS_COOKIE)?.value)
    : readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/super-admin") && session?.userType !== "super_admin") {
    return NextResponse.redirect(new URL(session ? "/access-denied" : "/login", request.url));
  }

  if (pathname.startsWith("/admin")) {
    if (session?.userType !== "admin" && session?.userType !== "super_admin") {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
  }

  if (pathname.startsWith("/portal") && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname.startsWith("/company") && session?.userType !== "company") {
    const destination = session ? "/access-denied" : "/login";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (pathname === "/login" && session) {
    const destination =
      session.userType === "super_admin"
        ? "/super-admin/dashboard"
        : session.userType === "admin"
          ? "/admin"
          : session.userType === "company"
            ? "/company/dashboard"
            : "/portal";
    return NextResponse.redirect(
      new URL(destination, request.url),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/super-admin/:path*", "/admin/:path*", "/portal/:path*", "/company/:path*", "/login"],
};
