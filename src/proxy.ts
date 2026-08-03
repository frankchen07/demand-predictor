import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "mtb_auth";

export function proxy(request: NextRequest) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (cookie === process.env.APP_PASSPHRASE) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/login|login).*)"],
};
