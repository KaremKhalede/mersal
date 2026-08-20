import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { assertBranchMatch } from "@/lib/branch-scope";
import { Prisma } from "@prisma/client";

const EMPLOYEE_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  userType: true,
  status: true,
  employeeCode: true,
  branchId: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

export async function listEmployeesPaged(params: {
  companyId: string;
  search?: string;
  roleId?: string;
  branchId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const { companyId, search, roleId, branchId, status, page = 1, pageSize = 10 } = params;
  const where = {
    companyId,
    userType: { in: ["COMPANY_USER", "DRIVER"] },
    AND: [
      branchId ? { branchId } : {},
      roleId ? { roleId } : {},
      status ? { status } : {},
      search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }, { phone: { contains: search } }] } : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: EMPLOYEE_LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Unpaginated — dropdown source (role/branch filter option lists, employee pickers). */
export async function listEmployees(companyId: string) {
  return prisma.user.findMany({
    where: { companyId, userType: { in: ["COMPANY_USER", "DRIVER"] } },
    select: EMPLOYEE_LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

export async function getEmployeeDetail(companyId: string, userId: string, branchScope?: string | null) {
  return prisma.user.findFirst({
    where: { id: userId, companyId, ...(branchScope ? { branchId: branchScope } : {}) },
    select: EMPLOYEE_LIST_SELECT,
  });
}

/** `EMP-0001`-style, company-scoped, generated inside the create transaction and retried on the
 * rare collision (two creates racing the same count) — see @@unique([companyId, employeeCode]). */
async function generateEmployeeCode(tx: Prisma.TransactionClient, companyId: string) {
  const count = await tx.user.count({ where: { companyId } });
  return `EMP-${String(count + 1).padStart(4, "0")}`;
}

export async function createEmployee(params: {
  companyId: string;
  branchId?: string;
  branchScope?: string | null;
  name: string;
  email: string;
  phone?: string;
  password: string;
  roleId?: string;
  userType: "COMPANY_USER" | "DRIVER";
}) {
  // A branch-scoped creator can only ever create within their own branch — pin it, don't trust the form.
  const branchId = params.branchScope ?? params.branchId;
  const passwordHash = await bcrypt.hash(params.password, 10);

  // ponytail: count-based code generation races under concurrent creates for the same company;
  // retried on the unique-constraint collision, upgrade to a DB sequence if that's ever observed.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const employeeCode = await generateEmployeeCode(tx, params.companyId);
        return tx.user.create({
          data: {
            companyId: params.companyId,
            branchId,
            name: params.name,
            email: params.email,
            phone: params.phone,
            passwordHash,
            roleId: params.roleId,
            userType: params.userType,
            employeeCode,
          },
          select: EMPLOYEE_LIST_SELECT,
        });
      });
    } catch (e) {
      const isCodeCollision = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && (e.meta?.target as string[] | undefined)?.includes("employeeCode");
      if (!isCodeCollision || attempt === 4) throw e;
    }
  }
  throw new Error("تعذّر إنشاء رقم موظف فريد");
}

export async function updateEmployee(
  companyId: string,
  userId: string,
  data: { name?: string; email?: string; phone?: string; roleId?: string | null; branchId?: string | null },
  branchScope?: string | null
) {
  const user = await prisma.user.findFirstOrThrow({ where: { id: userId, companyId } });
  assertBranchMatch(branchScope, user.branchId);
  if (data.branchId !== undefined) assertBranchMatch(branchScope, data.branchId);

  return prisma.user.update({ where: { id: user.id }, data, select: EMPLOYEE_LIST_SELECT });
}

export async function updateEmployeeStatus(companyId: string, userId: string, status: "ACTIVE" | "DISABLED", branchScope?: string | null) {
  const user = await prisma.user.findFirstOrThrow({ where: { id: userId, companyId } });
  assertBranchMatch(branchScope, user.branchId);
  return prisma.user.update({ where: { id: user.id }, data: { status }, select: EMPLOYEE_LIST_SELECT });
}

export async function listDrivers(companyId: string) {
  // A narrow select, not the full row — the caller (trips/new/page.tsx) passes this straight into
  // a Client Component prop (trip-wizard.tsx), and the full User row carries passwordHash.
  return prisma.user.findMany({
    where: { companyId, userType: "DRIVER", status: "ACTIVE" },
    select: { id: true, name: true },
  });
}
