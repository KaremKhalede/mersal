import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { assertPasswordStrength } from "@/lib/password";
import { absoluteUrl } from "@/lib/app-url";

/**
 * Admin-triggered password reset — the smallest safe recovery path, and deliberately not an
 * authentication system.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------------
 * Someone with authority over an account (their company admin, or a platform operator) issues a
 * one-time link. They hand that link to the person — in the office, over WhatsApp, however they
 * already communicate — and the person chooses their own password on a public page.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT DELIBERATELY IS NOT
 * ---------------------------------------------------------------------------------------------
 * No "forgot password" self-service flow: that needs a verified email channel, an outbound mail
 * provider, and its own anti-enumeration design, none of which exist here and none of which a pilot
 * with a handful of accounts needs. No admin-set passwords either — an admin who types a password
 * knows it, and "the manager knows every employee's password" is worse than the lockout it fixes.
 *
 * ---------------------------------------------------------------------------------------------
 * THE RULES THIS ENCODES
 * ---------------------------------------------------------------------------------------------
 *  - The raw token is returned to the caller exactly once, at creation, and never stored. Only its
 *    SHA-256 is written, so a database dump yields no working links.
 *  - SHA-256 without a salt is correct here and only here: the token is already 256 bits of
 *    uniform randomness, so there is nothing to brute-force and no rainbow table to build. (A
 *    *password* hash is the opposite case — that is what bcrypt is for, below.)
 *  - One outstanding token per account. Issuing a new one overwrites the hash, which silently kills
 *    any older link still sitting in someone's chat history.
 *  - It expires. An unused link is not a permanent spare key to the account.
 *  - Using it clears it, in the same write that changes the password — a link cannot be replayed.
 *  - Nothing here decides *who may reset whom*. That is the caller's job, and each call site
 *    applies its own scope (see the three actions that use createPasswordReset).
 */

const TOKEN_TTL_MINUTES = 60;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a reset for `userId` and returns the raw token — the only moment it exists in plaintext.
 * Callers turn it into a link with resetUrlFor() and show it to the admin once.
 */
export async function createPasswordReset(userId: string, actorId?: string) {
  const token = randomBytes(32).toString("base64url");
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      resetTokenHash: hashToken(token),
      resetTokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
    },
  });

  await logAudit({
    companyId: user.companyId ?? undefined,
    userId: actorId,
    action: "PASSWORD_RESET_ISSUED",
    entityType: "User",
    entityId: userId,
  });

  return { token, expiresAt: user.resetTokenExpiresAt!, name: user.name, email: user.email };
}

/** Absolute reset URL for an issued token — see src/lib/app-url.ts for why APP_URL is not allowed
 *  to be missing in production. */
export function resetUrlFor(token: string): string {
  return absoluteUrl(`/reset/${token}`);
}

/**
 * The account a token belongs to, or null. Expiry is part of "is this token valid", not a separate
 * check the caller might forget: a token past its expiry resolves to null exactly like a forged one.
 * Returns only what the reset page renders — never the password hash or anything else about the user.
 */
export async function resolvePasswordReset(token: string) {
  if (!token) return null;
  const user = await prisma.user.findUnique({
    where: { resetTokenHash: hashToken(token) },
    select: { id: true, name: true, email: true, status: true, resetTokenExpiresAt: true, company: { select: { status: true } } },
  });
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) return null;
  // A disabled account, or one inside a suspended company, cannot be brought back by a reset link —
  // that would be a way around the two switches that exist to stop it signing in.
  if (user.status !== "ACTIVE") return null;
  if (user.company && user.company.status !== "ACTIVE") return null;
  return { id: user.id, name: user.name, email: user.email };
}

/**
 * Sets the new password and burns the token in one write.
 *
 * The token is part of the WHERE, not just something checked beforehand: two submissions of the
 * same link race to the same row, and the second matches nothing because the first already nulled
 * the hash. So a link is single-use by construction rather than by timing.
 */
export async function completePasswordReset(token: string, newPassword: string) {
  assertPasswordStrength(newPassword);

  const target = await resolvePasswordReset(token);
  if (!target) throw new Error("هذا الرابط غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً.");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const claim = await prisma.user.updateMany({
    where: { id: target.id, resetTokenHash: hashToken(token) },
    data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
  });
  if (claim.count === 0) throw new Error("هذا الرابط غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً.");

  await logAudit({ userId: target.id, action: "PASSWORD_RESET_COMPLETED", entityType: "User", entityId: target.id });
  return { email: target.email };
}
