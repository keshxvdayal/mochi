import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";

const PUBLIC = ["/signin", "/signup"];
const PUBLIC_EXACT = new Set(["/", "/api/tts"]); // the landing page, and its demo voice (the route checks who may hear what)

/**
 * Optimistic gate: no session cookie → sign-in page (or 401 for the API).
 * The cookie's signature is verified where data is read (pageDb / withUser),
 * so a forged cookie gets through here but never reaches anyone's data.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_EXACT.has(pathname) || PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (req.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const url = new URL("/signin", req.url);
  if (pathname !== "/home") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|glb|wav|mp3)$).*)"],
};
