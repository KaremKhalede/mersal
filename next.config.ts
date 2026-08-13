import type { NextConfig } from "next";

// A full Content-Security-Policy is deliberately deferred, not omitted — Next.js's inline
// hydration scripts and shadcn/radix's runtime style injection need to be verified against a real
// CSP before shipping one that might silently break the app. The headers below are safe defaults
// that don't require that verification: they don't change how the app runs, only what a hostile
// third-party page embedding/reading it could do.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
