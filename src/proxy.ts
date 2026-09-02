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
  // /reset/<token> is public by necessity: the whole reason someone opens it is that they cannot
  // sign in. The token in the URL is the only credential, re-checked server-side on every submit.
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/track") ||
    // The customer's own tracking link. Short because its whole life is inside a WhatsApp message;
    // public because the token in it IS the credential.
    pathname.startsWith("/t/") ||
    pathname.startsWith("/reset") ||
    pathname === "/login" ||
    pathname.startsWith("/api");

  const session = await readSession(req);

  if (pathname === "/") {
    // If the user is signed in, redirect them to their respective dashboard.
    // Otherwise, let them see the public Landing Page.
    if (session) {
      if (session.userType === "PLATFORM_ADMIN") return NextResponse.redirect(new URL("/platform", req.url));
      if (session.userType === "DRIVER") return NextResponse.redirect(new URL("/driver", req.url));
      return NextResponse.redirect(new URL("/app", req.url));
    }
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

  // /reset is throttled with /login's tighter budget, not /track's: a reset token is a credential
  // that sets a password, so the request pattern to guard against is guessing, not browsing.
  const throttled =
    pathname === "/login" || pathname.startsWith("/track") || pathname.startsWith("/t/") || pathname.startsWith("/reset");
  if (throttled && !isBypassed) {
    const ip = clientIpFrom(req.headers);
    // /t/ shares the track budget: both are the same public surface, and an attacker walking
    // one should not get a fresh allowance by switching to the other.
    const bucket =
      pathname.startsWith("/track") || pathname.startsWith("/t/") ? "track" : pathname.startsWith("/reset") ? "reset" : "login";
    const limit = bucket === "track" ? { max: 30, windowMs: 5 * 60 * 1000 } : { max: 10, windowMs: 5 * 60 * 1000 };
    const allowed = await checkRateLimit(`${bucket}:${ip}`, limit);
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
