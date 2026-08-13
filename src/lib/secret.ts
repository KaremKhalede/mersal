const DEV_FALLBACK = "dev-only-secret-change-in-production-please";

// A predictable session secret in production means anyone can forge a valid JWT (e.g. mint
// their own PLATFORM_ADMIN session) — refuse to boot with the dev fallback once NODE_ENV=production.
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in production — refusing to start with the dev fallback secret.");
}

export const SESSION_SECRET_BYTES = new TextEncoder().encode(process.env.SESSION_SECRET ?? DEV_FALLBACK);
