-- Admin-issued password reset (src/modules/users/password-reset.ts).
--
-- Two nullable columns rather than a PasswordResetToken table: an account has at most one
-- outstanding reset at a time, the pair is written and cleared together, and it is never queried
-- independently of its user. A side table would add a join and a second row to keep in sync for no
-- gain. Nullable by definition — the overwhelmingly common state is "no reset outstanding".
--
-- Only the SHA-256 of the token is stored, never the token, so a database dump yields no working
-- reset links. Unique so the public reset page can resolve an account from a hashed token in one
-- indexed read, and so two live tokens can never collide. Both columns start NULL on every existing
-- row, which is exactly "no outstanding reset" — no backfill needed, and the unique index builds
-- cleanly because Postgres does not treat NULLs as duplicates of each other.
ALTER TABLE "User" ADD COLUMN "resetTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "resetTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_resetTokenHash_key" ON "User"("resetTokenHash");
