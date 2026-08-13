"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { saveDocument } from "@/modules/documents/service";
import { getBranchScope } from "@/lib/branch-scope";
import { assertCan } from "@/lib/rbac";

export async function uploadDocumentAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "documents", "upload");

  const file = formData.get("file") as File | null;
  const shipmentId = String(formData.get("shipmentId") || "");
  if (!file || file.size === 0) return { error: "اختر ملفاً للرفع" };

  await saveDocument({
    companyId: user.companyId!,
    shipmentId: shipmentId || undefined,
    docType: String(formData.get("docType") || "OTHER"),
    file,
    uploadedById: user.id,
    branchScope: getBranchScope(user),
  });

  if (shipmentId) revalidatePath(`/app/shipments/${shipmentId}`);
  revalidatePath("/app/documents");
}
