import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_SECRET_BYTES as secret } from "@/lib/secret";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

async function readSession(req: NextRequest) {
  const token = req.cookies.get("session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as { userType?: string };
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = pathname.startsWith("/track") || pathname === "/login" || pathname.startsWith("/api");

  const session = await readSession(req);

  if (pathname === "/") {
    if (!session) return NextResponse.redirect(new URL("/login", req.url));
    if (session.userType === "PLATFORM_ADMIN") return NextResponse.redirect(new URL("/platform", req.url));
    if (session.userType === "DRIVER") return NextResponse.redirect(new URL("/driver", req.url));
    return NextResponse.redirect(new URL("/app", req.url));
  }

  // Public, unauthenticated surfaces that a script could otherwise hammer freely: credential
  // guessing on /login, and shipment-number enumeration + delivery/pickup spam on /track (this
  // also covers the Server Actions those pages POST to, since Next.js posts them back to the same
  // page URL). Every other authenticated route is already gated by requiring a valid session below.
  //
  // Automated test traffic (Playwright) legitimately calls /login far more than any real user would
  // in the same window, so it authenticates a bypass with a secret header instead of an env flag
  // that disables protection for everyone. Unlike a blanket "disable rate limiting" switch, an
  // accidentally-set RATE_LIMIT_BYPASS_TOKEN in a real production project never weakens protection
  // for actual users — only requests that already know the exact secret skip the check.
  const bypassToken = process.env.RATE_LIMIT_BYPASS_TOKEN;
  const isBypassed = Boolean(bypassToken) && req.headers.get("x-rate-limit-bypass") === bypassToken;

  if ((pathname === "/login" || pathname.startsWith("/track")) && !isBypassed) {
    const ip = clientIpFrom(req.headers);
    const limit = pathname === "/login" ? { max: 10, windowMs: 5 * 60 * 1000 } : { max: 30, windowMs: 5 * 60 * 1000 };
    const allowed = await checkRateLimit(`${pathname.startsWith("/login") ? "login" : "track"}:${ip}`, limit);
    if (!allowed) {
      return new NextResponse("Too many requests — try again shortly.", { status: 429 });
    }
  }

  if (isPublic) return NextResponse.next();

  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  if (pathname.startsWith("/platform") && session.userType !== "PLATFORM_ADMIN") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname.startsWith("/app") && session.userType !== "COMPANY_USER") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (pathname.startsWith("/driver") && session.userType !== "DRIVER") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
