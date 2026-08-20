"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { retryNotification } from "@/modules/notifications/service";
import { actionResult } from "@/lib/action-result";

/**
 * Re-sends a failed WhatsApp notification.
 *
 * Gated on shipments.updateStatus rather than a new "notifications" permission: every message in
 * this log was produced by someone moving a shipment, so the right to send one again is the right
 * to move shipments. Adding a resource would also have started every existing role with it
 * unchecked — nobody able to retry anything until an admin edits each role, which is worse than the
 * mapping being approximate.
 *
 * companyId is passed to the service and re-checked there against the row, so a log id belonging to
 * another tenant is refused at the data layer, not merely hidden by the page query.
 */
export async function retryNotificationAction(logId: string) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "shipments", "updateStatus");
    const result = await retryNotification(user.companyId!, logId);
    revalidatePath("/app/notifications");
    return result;
  }, "تعذّرت إعادة الإرسال");
}
