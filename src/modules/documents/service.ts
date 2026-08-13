import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { assertSameCompany } from "@/lib/tenant";
import { shipmentTouchesBranch, assertShipmentBranchAccess } from "@/lib/branch-scope";
import { documentStorage } from "./storage";

export async function saveDocument(params: {
  companyId: string;
  shipmentId?: string;
  customsCaseId?: string;
  docType: string;
  file: File;
  uploadedById?: string;
  branchScope?: string | null;
}) {
  if (params.shipmentId) {
    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: params.shipmentId } });
    assertSameCompany({ userType: "COMPANY_USER", companyId: params.companyId }, shipment.companyId);
    assertShipmentBranchAccess(params.branchScope, shipment);
  }
  if (params.customsCaseId) {
    const customsCase = await prisma.customsCase.findUniqueOrThrow({ where: { id: params.customsCaseId }, include: { shipment: true } });
    assertSameCompany({ userType: "COMPANY_USER", companyId: params.companyId }, customsCase.companyId);
    assertShipmentBranchAccess(params.branchScope, customsCase.shipment);
  }

  const safeName = `${Date.now()}-${params.file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const key = `${params.companyId}/${safeName}`;
  const buffer = Buffer.from(await params.file.arrayBuffer());
  await documentStorage.write(key, buffer);

  const doc = await prisma.document.create({
    data: {
      companyId: params.companyId,
      shipmentId: params.shipmentId,
      customsCaseId: params.customsCaseId,
      docType: params.docType,
      fileName: params.file.name,
      filePath: key,
      uploadedById: params.uploadedById,
    },
  });

  await logAudit({ companyId: params.companyId, userId: params.uploadedById, action: "UPLOAD", entityType: "Document", entityId: doc.id });
  return doc;
}

/** Reads a document's bytes from storage. Caller is responsible for tenant/auth checks before calling this. */
export async function readDocumentFile(filePath: string) {
  return documentStorage.read(filePath);
}

export async function getDocumentById(documentId: string) {
  return prisma.document.findUnique({ where: { id: documentId } });
}

export async function listDocuments(companyId: string, shipmentId?: string, branchId?: string | null) {
  return prisma.document.findMany({
    where: {
      companyId,
      ...(shipmentId ? { shipmentId } : {}),
      // A Document attaches directly to a Shipment, or indirectly via a CustomsCase (which itself
      // always belongs to exactly one Shipment) — either path must resolve to a shipment that
      // touches the branch.
      ...(branchId
        ? { OR: [{ shipment: shipmentTouchesBranch(branchId) }, { customsCase: { shipment: shipmentTouchesBranch(branchId) } }] }
        : {}),
    },
    orderBy: { uploadedAt: "desc" },
  });
}
