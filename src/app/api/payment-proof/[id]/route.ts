import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSubmission } from "@/modules/billing/service";
import { documentStorage } from "@/modules/documents/storage";

/**
 * Streams a payment-proof file. Two-sided access by design: the platform admin who reviews it, and
 * the company that uploaded it — nobody else. Drivers are excluded outright, and a company user is
 * checked against the submission's own companyId, so one tenant can never read another's proof by
 * guessing an id. Bytes live outside public/ and are never given a static URL.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.userType === "DRIVER") return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const submission = await getSubmission(id);
  if (!submission?.proofKey) return new NextResponse("Not found", { status: 404 });

  const isPlatform = user.userType === "PLATFORM_ADMIN";
  if (!isPlatform && user.companyId !== submission.companyId) {
    return new NextResponse("Not found", { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await documentStorage.read(submission.proofKey);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = submission.proofKey.split(".").pop()?.toLowerCase();
  const contentType =
    ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(submission.proofFileName ?? "proof")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
