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
  // Emits a self-contained `.next/standalone` build (server + only the node_modules it actually
  // needs) so the Docker image below can copy a few files instead of the whole repo + full
  // node_modules. Vercel's own builder ignores this and uses its own packaging, so it is safe to
  // set unconditionally — it only changes what `next build` writes to disk locally/in Docker.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
