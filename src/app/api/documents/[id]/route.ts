import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getDocumentById,
  readDocumentFile,
  assertDocumentBranchAccess,
  DOCUMENT_CONTENT_TYPES,
} from "@/modules/documents/service";
import { assertSameCompany } from "@/lib/tenant";
import { getBranchScope } from "@/lib/branch-scope";

/**
 * Streams one uploaded document.
 *
 * Three things this route must never do again, all of which it used to:
 *  - serve without a Content-Type, so the browser sniffed the bytes and could execute an uploaded
 *    .html/.svg on this app's own origin;
 *  - serve `inline`, which is what made that sniffing reachable in a top-level tab;
 *  - authorize on company alone, making it the one document surface that ignored branch scope
 *    while listDocuments honours it.
 *
 * The type is derived from the extension saveDocument itself assigned from a validated MIME
 * whitelist — never from the uploaded filename — so it provably matches what was allowed in. An
 * unknown extension (a row predating that rule) is refused rather than guessed at.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.userType === "DRIVER") return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await getDocumentById(id);
  if (!doc) return new NextResponse("Not found", { status: 404 });

  try {
    assertSameCompany(user, doc.companyId);
    assertDocumentBranchAccess(getBranchScope(user), doc);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = doc.filePath.split(".").pop()?.toLowerCase() ?? "";
  const contentType = DOCUMENT_CONTENT_TYPES[ext];
  if (!contentType) return new NextResponse("Not found", { status: 404 });

  const bytes = await readDocumentFile(doc.filePath);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      // attachment, not inline: nothing uploaded by one employee should ever render as a document
      // in another employee's tab on this origin, whatever its declared type turns out to be.
      "Content-Disposition": `attachment; filename="${encodeURIComponent(doc.fileName)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
