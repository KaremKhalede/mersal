/**
 * The one place that decides what counts as an acceptable password.
 *
 * Before this, the rule was different in every direction: platform accounts required 6 characters,
 * `prisma/bootstrap.ts` required 12, and company employees and drivers — the accounts that hold
 * every shipment, customer phone number and payment record a tenant owns — required nothing at all.
 * A single shared minimum is the smallest thing that removes that inconsistency; deliberately no
 * character-class rules, no dictionary, no expiry policy, none of which this product needs and all
 * of which push a shipping-office employee toward writing the password on the monitor.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Throws an Arabic message the caller can hand straight to the employee. */
export function assertPasswordStrength(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل`);
  }
}
