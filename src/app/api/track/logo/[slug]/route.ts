import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { documentStorage } from "@/modules/documents/storage";

/**
 * A carrier's logo, for the public tracking page — the one image this product serves without a
 * session.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A SECOND LOGO ROUTE RATHER THAN OPENING THE EXISTING ONE
 * ---------------------------------------------------------------------------------------------
 * /api/company/logo resolves the company FROM THE SESSION, which is what makes it safe: there is no
 * id in the URL to tamper with and no cross-tenant read to get wrong. Loosening it to accept a
 * company parameter would turn a route with no attack surface into one with a parameter, on behalf
 * of a page that is a different problem.
 *
 * So this is a separate, deliberately smaller thing: given a slug, return image bytes or 404, and
 * nothing else. It reads three columns, returns no JSON, sets no cookie, and cannot be made to
 * disclose anything but "this carrier has a logo".
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT DISCLOSES, STATED PLAINLY
 * ---------------------------------------------------------------------------------------------
 * That a given slug exists and belongs to an active carrier. That is unavoidable for any branded
 * public page — the carrier hands this URL to its own customers, prints it, and puts it in WhatsApp
 * — and it is the same fact /track/<slug> discloses by rendering at all. It says nothing about that
 * carrier's shipments, branches, staff or billing; those still require the last-four check or a
 * session.
 *
 * A SUSPENDED carrier 404s here exactly as its page does, so a switched-off tenant stops serving
 * branding along with everything else.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const normalized = slug.trim().toLowerCase();
  if (!normalized || normalized.length > 80) return new NextResponse("Not found", { status: 404 });

  const company = await prisma.company.findUnique({
    where: { slug: normalized },
    select: { logoKey: true, status: true },
  });
  if (!company || company.status !== "ACTIVE" || !company.logoKey) {
    return new NextResponse("Not found", { status: 404 });
  }

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
      // Public and long-lived, unlike the session route's `private, no-store`: this is a brand mark
      // a customer's browser should keep, and it is the same bytes for every visitor. A carrier that
      // changes its logo uploads to a new key, so the URL's content does not silently go stale for
      // the lifetime of the cache.
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      // The bytes are user-uploaded. Even constrained to three image types, they must never be
      // interpreted as anything else if a content type is ever mis-derived.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
