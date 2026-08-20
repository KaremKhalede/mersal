"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { listInvoices, submitPayment } from "@/modules/billing/service";
import { documentStorage } from "@/modules/documents/storage";
import { assertCan } from "@/lib/rbac";
import { toCsv } from "@/lib/csv";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const PROOF_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type SubmitPaymentState = { error?: string; success?: boolean };

/**
 * The company *reports* a payment; it does not mark itself paid. Invoice issuance and payment
 * confirmation both moved to the platform (see /platform/billing) — the party owed the money is the
 * one that verifies it arrived. This action only ever writes a PENDING PaymentSubmission.
 */
export async function submitPaymentAction(
  _prev: SubmitPaymentState,
  formData: FormData
): Promise<SubmitPaymentState> {
  const user = await requireCompanyUser();
  assertCan(user, "billing", "manage");

  const invoiceId = String(formData.get("invoiceId") || "");
  const amount = Number(formData.get("amount"));
  if (!invoiceId) return { error: "الفاتورة مطلوبة" };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "مبلغ غير صالح" };

  // Date-only input; anchor at midday so a timezone shift can't roll it to the previous day.
  const paidAtRaw = String(formData.get("paidAt") || "").trim();
  if (paidAtRaw && Number.isNaN(Date.parse(paidAtRaw))) return { error: "تاريخ الدفع غير صالح" };

  let proofKey: string | undefined;
  let proofFileName: string | undefined;
  const proof = formData.get("proof");
  if (proof instanceof File && proof.size > 0) {
    const ext = PROOF_TYPES[proof.type];
    if (!ext) return { error: "صيغة الإثبات غير مدعومة — استخدم PDF أو PNG أو JPG" };
    if (proof.size > MAX_PROOF_BYTES) return { error: "حجم الملف يتجاوز 5 ميجابايت" };
    proofKey = `${user.companyId}/payment-${Date.now()}.${ext}`;
    proofFileName = proof.name;
    try {
      await documentStorage.write(proofKey, Buffer.from(await proof.arrayBuffer()));
    } catch {
      return { error: "تعذّر رفع الإثبات" };
    }
  }

  try {
    await submitPayment({
      companyId: user.companyId!,
      invoiceId,
      amount,
      method: String(formData.get("method") || "BANK_TRANSFER"),
      reference: String(formData.get("reference") || "").trim() || undefined,
      paidAt: paidAtRaw ? new Date(`${paidAtRaw}T12:00:00`) : undefined,
      note: String(formData.get("note") || "").trim() || undefined,
      proofKey,
      proofFileName,
      submittedById: user.id,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر إرسال الدفعة" };
  }

  revalidatePath("/app/billing");
  return { success: true };
}

const INVOICE_STATUS_LABELS: Record<string, string> = { PAID: "مسددة", UNPAID: "غير مسددة", CANCELLED: "ملغاة" };

/** CSV text for the "تصدير الفواتير" button — every invoice for this company, newest first. Same
 * BOM-prefix convention as exportShipmentsCsvAction (see its docstring). */
export async function exportInvoicesCsvAction() {
  const user = await requireCompanyUser();
  assertCan(user, "billing", "view");
  const invoices = await listInvoices(user.companyId!);

  const header = ["رقم الفاتورة", "من", "إلى", "الإجمالي", "المدفوع", "المتبقي", "الحالة"];
  const rows = invoices.map((inv) => [
    inv.invoiceNumber,
    inv.periodStart.toISOString().slice(0, 10),
    inv.periodEnd.toISOString().slice(0, 10),
    String(inv.totalAmount),
    String(inv.settled),
    String(inv.remaining),
    INVOICE_STATUS_LABELS[inv.status] ?? inv.status,
  ]);
  return toCsv(header, rows);
}
