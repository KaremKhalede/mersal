import { redirect } from "next/navigation";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession, createSession, destroySession } from "@/lib/session";
import type { Permissions } from "@/lib/enums";

export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { company: true, branch: true, role: true },
  });
  if (!user || user.status !== "ACTIVE") return null;
  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (user.userType !== "PLATFORM_ADMIN") redirect("/login");
  return user;
}

export async function requireCompanyUser() {
  const user = await requireUser();
  if (user.userType !== "COMPANY_USER" || !user.companyId) redirect("/login");
  return user;
}

export async function requireDriver() {
  const user = await requireUser();
  if (user.userType !== "DRIVER") redirect("/login");
  return user;
}

export function userPermissions(user: { role: { permissions: string } | null; userType: string }): Permissions {
  if (user.userType !== "COMPANY_USER") return {};
  if (!user.role) return {};
  try {
    return JSON.parse(user.role.permissions) as Permissions;
  } catch {
    return {};
  }
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") return { error: "بيانات الدخول غير صحيحة" };
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { error: "بيانات الدخول غير صحيحة" };

  await createSession({
    userId: user.id,
    userType: user.userType as "PLATFORM_ADMIN" | "COMPANY_USER" | "DRIVER",
    companyId: user.companyId,
    branchId: user.branchId,
    roleId: user.roleId,
  });

  return { user };
}

export async function logout() {
  await destroySession();
}
