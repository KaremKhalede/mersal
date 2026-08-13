/**
 * Supabase's dashboard "Connection pooling" string (port 6543, PgBouncer transaction mode) does
 * NOT include Prisma's required `?pgbouncer=true` flag by default — copy-pasting it as-is causes
 * "prepared statement already exists" errors under PgBouncer's transaction pooling, since Prisma
 * otherwise tries to use named prepared statements that don't survive being routed to a different
 * backend connection per transaction. Auto-correcting here means every entry point (the app,
 * prisma/seed.ts, prisma/bootstrap.ts) is safe even if DATABASE_URL was pasted straight from the
 * provider's dashboard. Only touches pooler-shaped URLs (port 6543) — a direct connection string
 * (5432, or any local Postgres) passes through unchanged.
 */
export function resolveDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (url.port === "6543" && !url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
      return url.toString();
    }
  } catch {
    // Not a parseable URL — let Prisma surface its own error rather than masking it here.
  }
  return raw;
}
