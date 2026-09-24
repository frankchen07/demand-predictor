import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "mtb_auth";
export const OWNER_COOKIE_NAME = "mtb_owner_auth";
// Paths visible to anyone with the shared passphrase are fine for daily bake-upload use;
// pricing/margin data is owner-only, so those paths need the second passphrase too.
const OWNER_ONLY_PATHS = ["/products"];

export function proxy(request: NextRequest) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (cookie !== process.env.APP_PASSPHRASE) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isOwnerOnlyPath = OWNER_ONLY_PATHS.some(
    (path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`),
  );
  if (isOwnerOnlyPath) {
    const ownerCookie = request.cookies.get(OWNER_COOKIE_NAME)?.value;
    if (ownerCookie !== process.env.APP_OWNER_PASSPHRASE) {
      const ownerLoginUrl = new URL("/owner-login", request.url);
      ownerLoginUrl.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(ownerLoginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/login|login).*)"],
};
