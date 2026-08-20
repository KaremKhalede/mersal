import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { documentStorage } from "@/modules/documents/storage";

/**
 * Serves the logged-in user's own company logo. The company is taken from the session, never from
 * the URL, so there is no id to tamper with and no cross-tenant read to get wrong. Bytes live
 * outside `public/` (see documents/storage.ts) and are streamed server-side, same as documents.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.companyId) return new NextResponse("Unauthorized", { status: 401 });

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { logoKey: true },
  });
  if (!company?.logoKey) return new NextResponse("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await documentStorage.read(company.logoKey);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  // Extension is constrained to png/jpg/webp at upload time (see settings/actions.ts).
  const ext = company.logoKey.split(".").pop()?.toLowerCase();
  const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
    },
  });
}
