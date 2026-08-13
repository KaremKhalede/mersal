import { prisma } from "@/lib/db";

export async function listBranches(companyId: string) {
  return prisma.branch.findMany({ where: { companyId }, orderBy: { createdAt: "asc" }, include: { _count: { select: { employees: true } } } });
}

export async function createBranch(params: { companyId: string; name: string; city: string; country: string }) {
  return prisma.branch.create({ data: params });
}

export async function updateBranch(companyId: string, branchId: string, data: { name?: string; city?: string; country?: string; status?: string }) {
  const branch = await prisma.branch.findFirstOrThrow({ where: { id: branchId, companyId } });
  return prisma.branch.update({ where: { id: branch.id }, data });
}
