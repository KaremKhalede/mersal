import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function listEmployees(companyId: string) {
  return prisma.user.findMany({
    where: { companyId, userType: { in: ["COMPANY_USER", "DRIVER"] } },
    include: { role: true, branch: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createEmployee(params: {
  companyId: string;
  branchId?: string;
  name: string;
  email: string;
  phone?: string;
  password: string;
  roleId?: string;
  userType: "COMPANY_USER" | "DRIVER";
  employeeCode?: string;
}) {
  const passwordHash = await bcrypt.hash(params.password, 10);
  return prisma.user.create({
    data: {
      companyId: params.companyId,
      branchId: params.branchId,
      name: params.name,
      email: params.email,
      phone: params.phone,
      passwordHash,
      roleId: params.roleId,
      userType: params.userType,
      employeeCode: params.employeeCode,
    },
  });
}

export async function updateEmployeeStatus(companyId: string, userId: string, status: "ACTIVE" | "DISABLED") {
  const user = await prisma.user.findFirstOrThrow({ where: { id: userId, companyId } });
  return prisma.user.update({ where: { id: user.id }, data: { status } });
}

export async function listDrivers(companyId: string) {
  return prisma.user.findMany({ where: { companyId, userType: "DRIVER", status: "ACTIVE" } });
}
