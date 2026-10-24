import { NextResponse, type NextRequest } from "next/server";

// Cheap cookie-presence gate; pages still validate the session against the database.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|signup|api|_next|manifest.webmanifest|icon.svg|favicon.ico).*)"],
};
