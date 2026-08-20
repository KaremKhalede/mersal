/**
 * The deployment's public base URL, and the one place that refuses to guess it.
 *
 * Two things in this product hand a link to a human who is not currently looking at the app:
 *   - the customer's tracking link, delivered over WhatsApp (src/lib/tracking.ts)
 *   - an admin-issued password reset link (src/modules/users/password-reset.ts)
 *
 * Both used to build their URL as `${process.env.APP_URL ?? ""}/...`. Unset, that produced
 * "/track/<token>" and "/reset/<token>" — strings that look fine in a log, pass every test, and are
 * useless to the person who receives them. A customer cannot open a relative path from a WhatsApp
 * message, and a locked-out employee cannot open one either.
 *
 * SESSION_SECRET and STORAGE_DRIVER already refuse to start a production process that is
 * misconfigured. APP_URL was the remaining one that failed silently, and its failure lands on the
 * two people least able to report it. So it fails the same way, at boot, with the same build-phase
 * exemption: `next build` imports every module to collect metadata and has no business needing a
 * deployment URL, while `next start` and every serverless invocation do.
 *
 * Development and CI keep the empty-string behaviour — nothing there sends a real message.
 */
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build" &&
  !process.env.APP_URL
) {
  throw new Error(
    "APP_URL must be set in production — tracking links and password-reset links are built from it, and without it both go out as relative paths that nobody can open."
  );
}

/** Absolute URL for an app-relative path (leading slash included, e.g. "/track/abc"). */
export function absoluteUrl(path: string): string {
  return `${(process.env.APP_URL ?? "").replace(/\/$/, "")}${path}`;
}
