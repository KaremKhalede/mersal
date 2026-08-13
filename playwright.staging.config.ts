import { defineConfig } from "@playwright/test";

/**
 * Runs the exact same specs in tests/e2e/ against a deployed staging URL instead of localhost —
 * no test duplication, only the target and timeouts differ from playwright.config.ts.
 *
 * Test fixtures (tests/e2e/helpers.ts) talk to the database directly via Prisma, not through the
 * app's HTTP API — so this only produces meaningful results when DATABASE_URL in this shell points
 * at the SAME database the staging deployment itself uses. Set both STAGING_URL and DATABASE_URL
 * before running:
 *
 *   STAGING_URL=https://chargee-staging.vercel.app DATABASE_URL="<staging pooler URL>" \
 *     npx playwright test --config=playwright.staging.config.ts
 */
if (!process.env.STAGING_URL) {
  throw new Error("STAGING_URL must be set — e.g. https://chargee-staging.vercel.app");
}

// Staging's rate limiter is real and shared (Upstash Redis) — without this, the suite's ~15 calls
// to login() from one IP would start hitting real 429s partway through. See src/proxy.ts for how
// the header is checked; RATE_LIMIT_BYPASS_TOKEN must equal the value set on the staging deployment.
if (!process.env.RATE_LIMIT_BYPASS_TOKEN) {
  throw new Error("RATE_LIMIT_BYPASS_TOKEN must be set to the same value configured on the staging deployment.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000, // real network latency + serverless cold starts, not loopback
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  expect: {
    timeout: 15_000, // toBeVisible()-style assertions must tolerate a cold Server Action round-trip
  },
  use: {
    baseURL: process.env.STAGING_URL,
    screenshot: "only-on-failure",
    navigationTimeout: 45_000,
    extraHTTPHeaders: { "x-rate-limit-bypass": process.env.RATE_LIMIT_BYPASS_TOKEN },
  },
});
