import { prisma } from "@/lib/db";
import { FULL_PERMISSIONS } from "@/lib/enums";
import bcrypt from "bcryptjs";

export async function listCompanies() {
  return prisma.company.findMany({
    include: { _count: { select: { branches: true, shipments: true, users: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCompanyDetail(companyId: string) {
  return prisma.company.findUnique({
    where: { id: companyId },
    include: { branches: true, _count: { select: { shipments: true, trips: true, users: true, customers: true } } },
  });
}

export async function createCompany(params: { name: string; slug: string; phone?: string; email?: string; adminName: string; adminEmail: string; adminPassword: string }) {
  const company = await prisma.company.create({
    data: { name: params.name, slug: params.slug, phone: params.phone, email: params.email },
  });

  const adminRole = await prisma.role.create({
    data: {
      companyId: company.id,
      name: "مدير الشركة",
      description: "صلاحية كاملة على الشركة",
      permissions: JSON.stringify(FULL_PERMISSIONS),
      isSystem: true,
    },
  });

  const passwordHash = await bcrypt.hash(params.adminPassword, 10);
  await prisma.user.create({
    data: {
      companyId: company.id,
      name: params.adminName,
      email: params.adminEmail,
      passwordHash,
      userType: "COMPANY_USER",
      roleId: adminRole.id,
    },
  });

  return company;
}

export async function setCompanyStatus(companyId: string, status: "ACTIVE" | "SUSPENDED") {
  return prisma.company.update({ where: { id: companyId }, data: { status } });
}

export async function platformOverview() {
  const [companies, shipments, trips, customers, deliveryRequests] = await Promise.all([
    prisma.company.count(),
    prisma.shipment.count(),
    prisma.trip.count(),
    prisma.customer.count(),
    prisma.deliveryRequest.count(),
  ]);
  const shipmentsByStatus = await prisma.shipment.groupBy({ by: ["status"], _count: true });
  return { companies, shipments, trips, customers, deliveryRequests, shipmentsByStatus };
}
