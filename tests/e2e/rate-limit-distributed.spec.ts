import { test, expect, request } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const hasRedis = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

/**
 * Regression tests for the bug the in-memory Map limiter had: a process-local counter looks
 * correct in every local/CI run (one process) and only fails once traffic actually spans multiple
 * independent processes/isolates, which is exactly Vercel Edge Middleware's real deployment shape.
 * Both tests below only pass if state genuinely lives in Redis, not in either process's memory.
 */
test.describe("Rate limiting is shared across independent instances, not per-instance", () => {
  test("two independent processes hammering the same key share one Redis-backed allowance", async () => {
    test.skip(!hasRedis, "requires UPSTASH_REDIS_REST_URL/TOKEN — run against the staging environment");

    const key = `regression-test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const max = 10;
    const attemptsPerProcess = 15; // > max/2, so if state were process-local both would nearly max out independently

    const workerPath = path.join(process.cwd(), "tests/e2e/fixtures/rate-limit-worker.mjs");
    const env = {
      ...process.env,
      KEY: key,
      MAX: String(max),
      WINDOW_MS: String(5 * 60 * 1000),
      ATTEMPTS: String(attemptsPerProcess),
    };

    const [a, b] = await Promise.all([
      execFileAsync("node", [workerPath], { env }),
      execFileAsync("node", [workerPath], { env }),
    ]);

    const resultA = JSON.parse(a.stdout);
    const resultB = JSON.parse(b.stdout);
    expect(resultA.pid).not.toBe(resultB.pid); // genuinely separate OS processes, not a fluke

    const totalSuccesses = resultA.successes + resultB.successes;
    // Old bug: each process's own in-memory Map would have allowed up to `max` independently,
    // i.e. up to attemptsPerProcess*2 total. Correct behavior: exactly `max` total, shared.
    expect(totalSuccesses).toBe(max);
  });

  test("the deployed app enforces the real limit under genuinely concurrent requests", async () => {
    test.skip(!hasRedis, "requires UPSTASH_REDIS_REST_URL/TOKEN — run against the staging environment");
    const baseURL = process.env.STAGING_URL;
    test.skip(!baseURL, "requires STAGING_URL — this checks the real deployed limiter, not localhost");

    // A fresh context with NO bypass header — unlike every other test in this suite, this one
    // needs the real limiter to actually engage. The standalone `request.newContext()` API still
    // inherits `use.extraHTTPHeaders` from playwright.staging.config.ts (confirmed empirically —
    // omitting the override here silently re-sends the real bypass token), so it must be cleared
    // explicitly rather than just left unset.
    const ctx = await request.newContext({ baseURL, extraHTTPHeaders: {} });
    const max = 30; // /track's configured limit, see src/proxy.ts
    const attempts = max + 10;

    const responses = await Promise.all(
      Array.from({ length: attempts }, (_, i) => ctx.get(`/track/rate-limit-regression-${Date.now()}-${i}`))
    );
    const statuses = responses.map((r) => r.status());
    const successCount = statuses.filter((s) => s !== 429).length;
    const rejectedCount = statuses.filter((s) => s === 429).length;

    expect(rejectedCount).toBeGreaterThan(0); // the limit must actually trigger
    expect(successCount).toBeLessThanOrEqual(max); // and not one independent `max` per isolate

    await ctx.dispose();
  });
});
