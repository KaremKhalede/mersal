"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { assertCanPlatform } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import {
  confirmPaymentSubmission,
  rejectPaymentSubmission,
  generateInvoice,
  getSubmission,
} from "@/modules/billing/service";

export type ReviewState = { error?: string; success?: string };

/**
 * Confirming is the only way money enters the ledger. Platform-admin only — this is the whole point
 * of the workflow: the party owed the money verifies it arrived.
 */
export async function confirmPaymentAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const admin = await requirePlatformAdmin();
  assertCanPlatform(admin, "billing", "reviewPayment");
  const id = String(formData.get("submissionId") || "");
  if (!id) return { error: "الدفعة غير محددة" };

  const submission = await getSubmission(id);
  if (!submission) return { error: "الدفعة غير موجودة" };

  try {
    await confirmPaymentSubmission(id, admin.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر تأكيد الدفعة" };
  }

  await logAudit({
    companyId: submission.companyId,
    userId: admin.id,
    action: "CONFIRM_PAYMENT",
    entityType: "PaymentSubmission",
    entityId: id,
  });

  revalidatePath("/platform/billing");
  revalidatePath("/app/billing");
  return { success: "تم تأكيد الدفعة" };
}

export async function rejectPaymentAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const admin = await requirePlatformAdmin();
  assertCanPlatform(admin, "billing", "reviewPayment");
  const id = String(formData.get("submissionId") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!id) return { error: "الدفعة غير محددة" };
  if (!reason) return { error: "سبب الرفض مطلوب" };

  const submission = await getSubmission(id);
  if (!submission) return { error: "الدفعة غير موجودة" };

  try {
    await rejectPaymentSubmission(id, reason, admin.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر رفض الدفعة" };
  }

  await logAudit({
    companyId: submission.companyId,
    userId: admin.id,
    action: "REJECT_PAYMENT",
    entityType: "PaymentSubmission",
    entityId: id,
  });

  revalidatePath("/platform/billing");
  revalidatePath("/app/billing");
  return { success: "تم رفض الدفعة" };
}

/**
 * Issues the invoice for a company's selected month. Moved here from the company dashboard — a
 * tenant must not be able to issue the bill it is going to be charged on.
 */
export async function generateInvoiceForCompanyAction(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const admin = await requirePlatformAdmin();
  assertCanPlatform(admin, "billing", "manage");
  const companyId = String(formData.get("companyId") || "");
  const month = String(formData.get("month") || "");
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!companyId || !m) return { error: "بيانات غير صالحة" };

  const periodStart = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  // Inclusive end: generateInvoice filters with `lte`, so use the last instant of the month.
  const periodEnd = new Date(Number(m[1]), Number(m[2]), 0, 23, 59, 59, 999);

  let invoice;
  try {
    invoice = await generateInvoice(companyId, periodStart, periodEnd);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر إصدار الفاتورة" };
  }
  if (!invoice) return { error: "لا توجد قيود غير مفوترة في هذه الفترة" };

  await logAudit({
    companyId,
    userId: admin.id,
    action: "GENERATE_INVOICE",
    entityType: "Invoice",
    entityId: invoice.id,
  });

  revalidatePath("/platform/billing");
  revalidatePath(`/platform/billing/${companyId}`);
  revalidatePath("/app/billing");
  return { success: `تم إصدار الفاتورة ${invoice.invoiceNumber}` };
}
