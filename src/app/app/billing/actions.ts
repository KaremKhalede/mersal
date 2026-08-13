"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { generateInvoice, recordSettlement } from "@/modules/billing/service";
import { assertCan } from "@/lib/rbac";

export async function generateInvoiceAction() {
  const user = await requireCompanyUser();
  assertCan(user, "billing", "manage");

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = now;

  const invoice = await generateInvoice(user.companyId!, periodStart, periodEnd);
  revalidatePath("/app/billing");
  if (!invoice) throw new Error("لا توجد قيود جديدة لإصدار فاتورة بها");
  return invoice;
}

export async function recordSettlementAction(invoiceId: string, formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "billing", "manage");

  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "مبلغ غير صالح" };

  try {
    await recordSettlement(user.companyId!, invoiceId, amount, String(formData.get("note") || "") || undefined);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر تسجيل التسوية" };
  }
  revalidatePath("/app/billing");
}
