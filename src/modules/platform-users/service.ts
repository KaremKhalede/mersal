import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";


/**
 * Staff accounts of the platform company itself — strictly `userType: PLATFORM_ADMIN`. Company
 * employees and drivers are managed inside their own tenant (/app/employees) and must never appear
 * or be editable here.
 */
const PLATFORM_ONLY = { userType: "PLATFORM_ADMIN" as const };

export async function listPlatformUsers(params: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const pageSize = Math.min(Math.max(params.pageSize ?? 10, 1), 100);
  const page = Math.max(params.page ?? 1, 1);
  const search = params.search?.trim();

  const where = {
    ...PLATFORM_ONLY,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(params.status === "ACTIVE" || params.status === "DISABLED" ? { status: params.status } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        platformRoleId: true,
        platformRoleRef: { select: { id: true, name: true, isSuperAdmin: true } },
      },
    }),
  ]);

  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** A platform account with its role, or null when the id belongs to a company user/driver. */
export async function getPlatformUser(userId: string) {
  return prisma.user.findFirst({ where: { id: userId, ...PLATFORM_ONLY }, include: { platformRoleRef: true } });
}

export async function createPlatformUser(params: {
  name: string;
  email: string;
  phone?: string;
  platformRoleId: string;
  status: string;
  password: string;
}) {
  const passwordHash = await bcrypt.hash(params.password, 10);
  return prisma.user.create({
    data: {
      name: params.name,
      email: params.email,
      phone: params.phone,
      passwordHash,
      userType: "PLATFORM_ADMIN",
      platformRoleId: params.platformRoleId,
      status: params.status === "DISABLED" ? "DISABLED" : "ACTIVE",
    },
    select: { id: true },
  });
}

export async function updatePlatformUser(
  userId: string,
  data: { name: string; email: string; phone?: string | null; platformRoleId: string }
) {
  // Scoped update — updateMany with the PLATFORM_ONLY filter so a company user's id can never be
  // edited through this page even if the id is guessed.
  const result = await prisma.user.updateMany({ where: { id: userId, ...PLATFORM_ONLY }, data });
  if (result.count === 0) throw new Error("المستخدم غير موجود");
}

export async function setPlatformUserStatus(userId: string, status: "ACTIVE" | "DISABLED") {
  const result = await prisma.user.updateMany({ where: { id: userId, ...PLATFORM_ONLY }, data: { status } });
  if (result.count === 0) throw new Error("المستخدم غير موجود");
}
