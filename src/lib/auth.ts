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
    // platformRoleRef drives every platform-console permission check (see canPlatform in rbac.ts);
    // without it loaded here those checks fail closed and lock operators out.
    include: { company: true, branch: true, role: true, platformRoleRef: true },
  });
  if (!user || user.status !== "ACTIVE") return null;
  // A suspended tenant is suspended for everyone inside it — employees and drivers alike.
  //
  // Company.status was written by the platform console and read by nothing: "إيقاف الشركة" changed
  // a column and the company kept working, which made the platform's only commercial lever over a
  // non-paying tenant a no-op button. Enforced here rather than in the middleware because the
  // middleware only sees the session JWT and cannot reach the database, and here is the one
  // chokepoint every /app and /driver page and every Server Action already passes through
  // (requireCompanyUser / requireDriver both resolve through this). Failing to null sends them to
  // /login exactly like a disabled account does.
  //
  // PLATFORM_ADMIN has no companyId, so platform staff keep full access to a suspended company's
  // records — reviewing its billing and reactivating it is the entire point of suspending it.
  if (user.company && user.company.status !== "ACTIVE") return null;
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
  const user = await prisma.user.findUnique({
    where: { email },
    include: { company: { select: { status: true } } },
  });
  if (!user || user.status !== "ACTIVE") return { error: "بيانات الدخول غير صحيحة" };
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { error: "بيانات الدخول غير صحيحة" };

  // Checked after the password, not before: answering "this company is suspended" to an unverified
  // email would tell an outsider which companies exist and what state they are in. Once the
  // credentials are proven correct, the real reason is the useful one — the employee needs to know
  // to call the office, not to keep retrying a password that is actually right.
  if (user.company && user.company.status !== "ACTIVE") {
    return { error: "حساب الشركة موقوف حالياً. يرجى التواصل مع إدارة المنصة." };
  }

  await createSession({
    userId: user.id,
    userType: user.userType as "PLATFORM_ADMIN" | "COMPANY_USER" | "DRIVER",
    companyId: user.companyId,
    branchId: user.branchId,
    roleId: user.roleId,
  });

  // Best-effort: a failure to stamp the login time must never block signing in.
  await prisma.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    .catch(() => undefined);

  return { user };
}

export async function logout() {
  await destroySession();
}
