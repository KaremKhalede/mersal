import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { assertSameCompany } from "@/lib/tenant";
import { shipmentTouchesBranch, assertShipmentBranchAccess } from "@/lib/branch-scope";
import { documentStorage } from "./storage";

/**
 * What a shipping office actually attaches to a shipment: a scanned invoice, a customs declaration,
 * an ID photo. Nothing here can be executed by a browser.
 *
 * A whitelist, not a blacklist, and enforced on the *declared MIME type* rather than the filename:
 * before this, any file at all could be stored and /api/documents/[id] streamed it back `inline`
 * with no Content-Type at all, so an uploaded .html or .svg was sniffed and executed on the app's
 * own origin. The session cookie is httpOnly, but same-origin script can call any Server Action as
 * whoever opened the file — a branch employee could escalate to whatever a company admin can do
 * simply by attaching a document and waiting.
 *
 * SVG is deliberately absent despite being an image: it is a script-carrying document format.
 *
 * The extension the file is STORED under comes from this map, never from the uploaded filename —
 * that is what lets the download route derive a Content-Type it can prove matches what was
 * validated here. The original name is kept separately in Document.fileName for display.
 */
const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Content-Type for a stored document key — the inverse of DOCUMENT_TYPES, keyed by the extension
 *  this module itself assigned. Used by /api/documents/[id]; exported so the two can never drift. */
export const DOCUMENT_CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

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

  const ext = DOCUMENT_TYPES[params.file.type];
  if (!ext) throw new Error("صيغة الملف غير مدعومة — استخدم PDF أو PNG أو JPG أو WEBP");
  if (params.file.size > MAX_DOCUMENT_BYTES) throw new Error("حجم الملف يتجاوز 10 ميجابايت");

  const key = `${params.companyId}/doc-${Date.now()}.${ext}`;
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

/**
 * One document with everything the download route needs to authorize it: the company it belongs to,
 * and — through either attachment path — the shipment whose branches decide who may read it.
 *
 * The route used to check only assertSameCompany, which left it as the single document surface in
 * the app that ignored branch scope while listDocuments below honours it. A document with no
 * shipment and no customs case has no branch to scope by (it is a company-level file) and stays
 * visible company-wide, which is the same rule listDocuments applies by simply not filtering it out.
 */
export async function getDocumentById(documentId: string) {
  return prisma.document.findUnique({
    where: { id: documentId },
    include: { shipment: true, customsCase: { include: { shipment: true } } },
  });
}

/** Throws unless `branchScope` may read this document — company-level files are always readable. */
export function assertDocumentBranchAccess(
  branchScope: string | null | undefined,
  doc: {
    shipment: { loadBranchId: string; unloadBranchId: string; currentBranchId: string | null } | null;
    customsCase: { shipment: { loadBranchId: string; unloadBranchId: string; currentBranchId: string | null } } | null;
  }
) {
  if (!branchScope) return;
  const shipment = doc.shipment ?? doc.customsCase?.shipment;
  if (!shipment) return;
  assertShipmentBranchAccess(branchScope, shipment);
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
