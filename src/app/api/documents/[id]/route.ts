import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDocumentById, readDocumentFile } from "@/modules/documents/service";
import { assertSameCompany } from "@/lib/tenant";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.userType === "DRIVER") return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await getDocumentById(id);
  if (!doc) return new NextResponse("Not found", { status: 404 });

  try {
    assertSameCompany(user, doc.companyId);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const bytes = await readDocumentFile(doc.filePath);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
