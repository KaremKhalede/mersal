import { prisma } from "@/lib/db";
import { shipmentTouchesBranch } from "@/lib/branch-scope";
import { normalizePhone } from "@/lib/phone";

/**
 * Every phone spelling that should resolve to the same customer: what the clerk typed, plus its
 * E.164 form (src/lib/phone.ts). Customer identity is (companyId, phone), and that match used to be
 * a raw string comparison — so the same person entered once as "0501234567" and later as
 * "+966 50 123 4567" became two Customer rows, splitting their shipment history in two. Matching on
 * both forms, and *storing* the canonical one on create, keeps one person to one record.
 *
 * Not a schema change: normalizePhone returns null for anything it can't confidently parse (a
 * landline, a foreign number, a typo), and those keep working exactly as before on the raw string.
 */
function phoneMatches(phone: string): string[] {
  const normalized = normalizePhone(phone);
  return normalized && normalized !== phone ? [phone, normalized] : [phone];
}

export async function listCustomers(params: {
  companyId: string;
  search?: string;
  branchId?: string | null;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const { companyId, search, branchId, status, page = 1, pageSize = 10 } = params;
  const where = {
    companyId,
    // Each optional facet gets its own OR clause, combined via AND — sibling-spreading two ORs
    // onto the same object is unsafe (see shipments/service.ts::listShipments for why).
    AND: [
      branchId ? { OR: [{ homeBranchId: branchId }, { shipments: { some: shipmentTouchesBranch(branchId) } }] } : {},
      search ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }] } : {},
      status ? { status } : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        homeBranch: { select: { id: true, name: true } },
        _count: { select: { shipments: true } },
        // Dynamic "آخر شحنة" — the customer's own most recent shipment, not a stored column that
        // could drift from reality.
        shipments: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, shipmentNumber: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Existence check only — used by the customers-page "إضافة عميل" flow to tell the employee it
 * matched an existing record instead of silently reusing it (findOrCreateCustomer itself stays a
 * plain create-or-return, unchanged, since shipment intake also calls it and must not change
 * behavior). */
export async function findCustomerByPhone(companyId: string, phone: string) {
  return prisma.customer.findFirst({ where: { companyId, phone: { in: phoneMatches(phone) } } });
}

/**
 * Identity resolution for shipment intake — matches by (companyId, phone), never by name (names
 * collide; phone is the practical real-world identifier a counter clerk actually has in hand).
 * Never merges two existing customers, and never widens the match to "name only" — see the
 * business rule this encodes in AGENTS.md / the customers-page spec: ambiguous or missing matches
 * are a human decision, not something this function silently resolves.
 */
export async function findOrCreateCustomer(params: { companyId: string; name: string; phone: string; email?: string; homeBranchId?: string; address?: string }) {
  const existing = await prisma.customer.findFirst({
    where: { companyId: params.companyId, phone: { in: phoneMatches(params.phone) } },
  });
  if (existing) return existing;
  return prisma.customer.create({
    data: {
      companyId: params.companyId,
      name: params.name,
      // Store the canonical E.164 form when the number parses, so every later lookup — and the
      // WhatsApp dispatch, which normalizes anyway — agrees on one spelling.
      phone: normalizePhone(params.phone) ?? params.phone,
      email: params.email || null,
      address: params.address || null,
      homeBranchId: params.homeBranchId || null,
    },
  });
}

export async function updateCustomer(
  companyId: string,
  customerId: string,
  data: { name?: string; phone?: string; email?: string | null; address?: string | null; homeBranchId?: string | null; status?: string }
) {
  const customer = await prisma.customer.findFirstOrThrow({ where: { id: customerId, companyId } });
  return prisma.customer.update({ where: { id: customer.id }, data });
}

export async function getCustomerDetail(companyId: string, customerId: string, branchId?: string | null) {
  return prisma.customer.findFirst({
    where: {
      id: customerId,
      companyId,
      ...(branchId ? { OR: [{ homeBranchId: branchId }, { shipments: { some: shipmentTouchesBranch(branchId) } }] } : {}),
    },
    include: {
      homeBranch: { select: { id: true, name: true } },
      shipments: {
        orderBy: { createdAt: "desc" },
        include: { unloadBranch: { select: { name: true } } },
      },
    },
  });
}
