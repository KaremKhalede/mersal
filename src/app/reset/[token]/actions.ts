"use server";

import { completePasswordReset } from "@/modules/users/password-reset";

export type ResetState = { error?: string; success?: boolean };

/**
 * Public, unauthenticated — the whole point is that the person cannot sign in. The token in the URL
 * is the only credential, and completePasswordReset re-resolves it server-side on every submit:
 * nothing is trusted from the form but the new password itself.
 *
 * Rate limiting for this route lives in src/proxy.ts alongside /login and /track, since Next.js
 * posts a Server Action back to the page's own URL.
 */
export async function completeResetAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("passwordConfirm") || "");

  if (password !== confirm) return { error: "كلمتا المرور غير متطابقتين" };

  try {
    await completePasswordReset(token, password);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر تعيين كلمة المرور" };
  }

  return { success: true };
}
