import { prisma } from "@/lib/db";

/**
 * ============================================================================================
 * TENANT RESOLUTION FOR THE PUBLIC TRACKING SURFACE
 * ============================================================================================
 *
 * One page, one component, one UX — and the carrier's own identity on it. There is no per-company
 * route, no per-company template and no per-company copy: `[company]` is a URL segment resolved to
 * a row, and every branded surface reads from this one shape.
 *
 * ## What a carrier is allowed to publish about itself
 *
 * Exactly the fields below, and they are all things a carrier already prints on a label, a manifest
 * or a receipt: its name, its brand colour, whether it has a logo, and how to reach it. Nothing
 * about its shipments, its branches, its staff, its billing or its status on the platform.
 *
 * `status` is read but never returned: a SUSPENDED company resolves to null. A tenant the platform
 * has switched off must not keep serving a branded page — its shipments are still trackable through
 * the token link, which is keyed by the shipment rather than by the carrier, so nobody loses sight
 * of goods already in flight.
 *
 * ## Why the slug and not the id
 *
 * `Company.slug` is already unique, already chosen by the operator, and already the human-readable
 * handle for a tenant. A cuid in a URL a customer is expected to type or recognise is hostile, and
 * an incrementing id would leak how many carriers the platform has.
 *
 * Resolving a slug does confirm that a slug exists — that is the one thing this surface discloses,
 * and it is unavoidable for any branded public page: the carrier hands this URL to its own
 * customers. It discloses nothing about their shipments, which still require the last-four check.
 */
export type PublicCarrier = {
  slug: string;
  name: string;
  logoColor: string;
  /** Whether /api/track/logo/<slug> will return bytes. The key itself never leaves the server. */
  hasLogo: boolean;
  phone: string | null;
  email: string | null;
};

export async function resolvePublicCarrier(slug: string): Promise<PublicCarrier | null> {
  const trimmed = slug.trim().toLowerCase();
  if (!trimmed || trimmed.length > 80) return null;

  const company = await prisma.company.findUnique({
    where: { slug: trimmed },
    select: { slug: true, name: true, logoColor: true, logoKey: true, phone: true, email: true, status: true },
  });
  if (!company || company.status !== "ACTIVE") return null;

  return {
    slug: company.slug,
    name: company.name,
    logoColor: company.logoColor,
    hasLogo: Boolean(company.logoKey),
    phone: company.phone,
    email: company.email,
  };
}

/**
 * The carrier behind a shipment, for the token route — which knows the shipment before it knows
 * the company, i.e. the opposite direction from the lookup.
 *
 * Same shape and same rules, so the token page and the branded lookup cannot end up dressed
 * differently. A suspended carrier still resolves here on purpose: the customer holds a link to a
 * shipment that physically exists and may still be sitting in a branch, and hiding the carrier's
 * name would leave them holding a page that cannot tell them whose counter to walk into.
 */
export function carrierFromCompany(company: {
  slug: string;
  name: string;
  logoColor: string;
  logoKey: string | null;
  phone: string | null;
  email: string | null;
}): PublicCarrier {
  return {
    slug: company.slug,
    name: company.name,
    logoColor: company.logoColor,
    hasLogo: Boolean(company.logoKey),
    phone: company.phone,
    email: company.email,
  };
}
