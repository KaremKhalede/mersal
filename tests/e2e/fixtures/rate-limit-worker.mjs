// Standalone script, deliberately NOT importing src/lib/rate-limit.ts — each invocation of this
// file is a separate OS process with its own independent memory, module registry, and Redis SDK
// connection, exactly like separate Vercel Edge isolates. If rate-limit state ever lived in
// process memory again (the bug this test guards against), each process would get its own
// independent `max` allowance instead of sharing one.
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const { KEY, MAX, WINDOW_MS, ATTEMPTS } = process.env;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const limiter = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(Number(MAX), `${WINDOW_MS} ms`) });

let successes = 0;
for (let i = 0; i < Number(ATTEMPTS); i++) {
  const { success } = await limiter.limit(KEY);
  if (success) successes++;
}

process.stdout.write(JSON.stringify({ pid: process.pid, successes }));
