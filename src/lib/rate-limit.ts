import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

/**
 * Shared, cross-instance rate limiter backed by Upstash Redis (REST API — works from Vercel Edge
 * Middleware, which has no TCP socket access). Replaces the earlier in-memory Map, which was only
 * correct for a single long-lived Node process: Vercel's Edge runtime spreads requests across many
 * independent isolates with separate memory, so a process-local counter never saw the true request
 * count (confirmed empirically against staging — /track's limit never triggered across 35 rapid
 * requests). Redis is the one thing every isolate actually shares.
 */
// Not configured — local dev and CI don't get their own Redis instance (nothing else in either
// environment needs one). checkRateLimit fails open below in that case, same as a runtime outage.
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

const limiters = new Map<string, Ratelimit>();

function limiterFor(opts: { max: number; windowMs: number }): Ratelimit {
  const cacheKey = `${opts.max}:${opts.windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.fixedWindow(opts.max, `${opts.windowMs} ms`),
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

export async function checkRateLimit(key: string, opts: { max: number; windowMs: number }): Promise<boolean> {
  if (!redis) return true;
  try {
    const { success } = await limiterFor(opts).limit(key);
    return success;
  } catch (err) {
    // A Redis outage should degrade to "unprotected" for the few minutes it lasts, not take down
    // login/tracking for every real user — this is defense-in-depth, not a correctness boundary.
    console.error("rate-limit check failed, failing open:", err);
    return true;
  }
}

export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
