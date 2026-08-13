import { prisma } from "@/lib/db";
import { shipmentTouchesBranch } from "@/lib/branch-scope";

export async function listCustomers(companyId: string, search?: string, branchId?: string | null, page = 1, pageSize = 20) {
  const where = {
    companyId,
    // branchId and search each need their own OR clause — combined via AND, see
    // shipments/service.ts::listShipments for why sibling-spreading two `OR`s is unsafe.
    AND: [
      branchId ? { OR: [{ homeBranchId: branchId }, { shipments: { some: shipmentTouchesBranch(branchId) } }] } : {},
      search ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }] } : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { _count: { select: { shipments: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);

  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function findOrCreateCustomer(params: { companyId: string; name: string; phone: string; homeBranchId?: string; address?: string }) {
  const existing = await prisma.customer.findFirst({ where: { companyId: params.companyId, phone: params.phone } });
  if (existing) return existing;
  return prisma.customer.create({ data: params });
}

export async function getCustomerDetail(companyId: string, customerId: string, branchId?: string | null) {
  return prisma.customer.findFirst({
    where: {
      id: customerId,
      companyId,
      ...(branchId ? { OR: [{ homeBranchId: branchId }, { shipments: { some: shipmentTouchesBranch(branchId) } }] } : {}),
    },
    include: { shipments: { orderBy: { createdAt: "desc" } } },
  });
}
