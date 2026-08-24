import { prisma } from "@/lib/db";

export async function listBranches(companyId: string) {
  return prisma.branch.findMany({ where: { companyId }, orderBy: { createdAt: "asc" }, include: { _count: { select: { employees: true } } } });
}

/** Filtered + paginated variant for /app/branches itself — kept separate from the plain
 * `listBranches` above, which every other page (employees, shipments, reports, trip creation)
 * relies on for an unpaginated dropdown source; changing its shape would ripple into all of them. */
export async function listBranchesPaged(companyId: string, params: { search?: string; country?: string; status?: string; page?: number; pageSize?: number }) {
  const { search, country, status, page = 1, pageSize = 10 } = params;
  const where = {
    companyId,
    ...(search ? { name: { contains: search } } : {}),
    ...(country ? { country } : {}),
    ...(status ? { status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.branch.findMany({
      where,
      include: { _count: { select: { employees: true } } },
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.branch.count({ where }),
  ]);
  return { items, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getBranchDetail(companyId: string, branchId: string) {
  const branch = await prisma.branch.findFirstOrThrow({ where: { id: branchId, companyId }, include: { _count: { select: { employees: true } } } });
  const employees = await prisma.user.findMany({
    where: { companyId, branchId },
    include: { role: true },
    orderBy: { createdAt: "asc" },
  });
  return { branch, employees };
}

/** `phone`/`address` are optional everywhere they appear — see the schema comment on Branch. A
 *  blank field is stored as NULL rather than "", so a consumer can test the value itself instead of
 *  every screen re-deciding whether an empty string counts as "no number". */
export async function createBranch(params: {
  companyId: string;
  name: string;
  city: string;
  country: string;
  phone?: string | null;
  address?: string | null;
}) {
  return prisma.branch.create({ data: params });
}

export async function updateBranch(
  companyId: string,
  branchId: string,
  data: { name?: string; city?: string; country?: string; status?: string; phone?: string | null; address?: string | null }
) {
  const branch = await prisma.branch.findFirstOrThrow({ where: { id: branchId, companyId } });
  return prisma.branch.update({ where: { id: branch.id }, data });
}
