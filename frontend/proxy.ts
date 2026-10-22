import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/server/session-token";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);

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
  matcher: ["/admin/:path*", "/portal/:path*", "/company/:path*", "/login"],
};
