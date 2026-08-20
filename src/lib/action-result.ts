/**
 * Turning a thrown server-side error into something an Arabic-speaking employee can act on.
 *
 * ---------------------------------------------------------------------------------------------
 * THE PROBLEM THIS SOLVES
 * ---------------------------------------------------------------------------------------------
 * Next.js redacts the message of any error thrown out of a Server Action in a production build,
 * replacing it with an opaque digest. That is the right default — messages can leak schema and
 * internals — but it means every carefully written Arabic message in the service layer
 * ("لا يمكن إنهاء الرحلة قبل تفريغ جميع الشحنات") reaches the user in production as nothing but
 * "حدث خطأ غير متوقع".
 *
 * So an action must not let an error escape: it has to catch it and *return* the message as data.
 * Roughly half the action files already did this by hand; this module makes it one call, and makes
 * the safety rule explicit rather than per-file judgement.
 *
 * ---------------------------------------------------------------------------------------------
 * THE SAFETY RULE
 * ---------------------------------------------------------------------------------------------
 * Only messages that were deliberately written for a user are shown. The signal for that, in an
 * Arabic-first product, is simply: does the message contain Arabic?
 *
 *   - Service errors intended for humans are all written in Arabic. Shown as-is.
 *   - Internal ones never are: `FORBIDDEN: missing trips.complete`, Prisma's
 *     "Invalid `prisma.shipment.update()` invocation", `ECONNREFUSED`, stack-bearing TypeErrors.
 *     These are replaced with a generic sentence and logged server-side.
 *
 * That single test is more reliable than maintaining a list of error classes to redact, and it
 * fails closed: anything unrecognised is treated as internal and hidden.
 */

const ARABIC = /[؀-ۿ]/;

const GENERIC = "تعذّر تنفيذ الإجراء. حاول مرة أخرى.";
const FORBIDDEN = "ليس لديك صلاحية لتنفيذ هذا الإجراء.";
const NOT_FOUND = "لم يعد هذا العنصر متاحاً. حدّث الصفحة وحاول مرة أخرى.";

/** The shape every hardened action returns on failure. */
export type ActionError = { error: string };

/**
 * Maps a caught error to a message that is safe to display.
 *
 * `fallback` lets a call site say what failed ("تعذّر بدء الرحلة") instead of the generic sentence,
 * which is what makes the difference for a driver holding a phone at a border crossing.
 */
export function toUserMessage(error: unknown, fallback: string = GENERIC): string {
  if (!(error instanceof Error)) return fallback;

  // Authorization failures are deliberately terse and English in the guard layer (rbac.ts,
  // branch-scope.ts). Translate them once, here, rather than in every action.
  if (error.message.startsWith("FORBIDDEN")) return FORBIDDEN;

  // Prisma's "record not found" for a row that vanished between render and submit.
  if (error.message.includes("No record was found") || error.message.includes("NotFoundError")) {
    return NOT_FOUND;
  }

  return ARABIC.test(error.message) ? error.message : fallback;
}

/**
 * Wraps an action body so a throw becomes a returned `{ error }` instead of a production digest.
 * The original error is logged server-side, where it keeps its full detail for debugging.
 */
export async function actionResult<T>(
  run: () => Promise<T>,
  fallback?: string
): Promise<T | ActionError> {
  try {
    return await run();
  } catch (error) {
    console.error("[action]", error);
    return { error: toUserMessage(error, fallback) };
  }
}
