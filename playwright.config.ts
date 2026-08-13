import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false, // several scenarios claim shared demo data / DB rows — keep sequential for determinism
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    // No-op locally/in CI (no Redis configured there, so the limiter fails open regardless) —
    // present so the same header is always sent, matching playwright.staging.config.ts exactly.
    extraHTTPHeaders: process.env.RATE_LIMIT_BYPASS_TOKEN ? { "x-rate-limit-bypass": process.env.RATE_LIMIT_BYPASS_TOKEN } : {},
  },
});
