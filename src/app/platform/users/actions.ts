"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/auth";
import { assertCanPlatform, canPlatform } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import {
  createPlatformUser,
  updatePlatformUser,
  setPlatformUserStatus,
  getPlatformUser,
} from "@/modules/platform-users/service";
import { getPlatformRole, countActiveSuperAdmins } from "@/modules/platform-roles/service";
import { createPasswordReset, resetUrlFor } from "@/modules/users/password-reset";
import { assertPasswordStrength } from "@/lib/password";
import { actionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";

function isDuplicateEmail(e: unknown) {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002" &&
    (e.meta?.target as string[] | undefined)?.includes("email")
  );
}

function readForm(formData: FormData) {
  return {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim().toLowerCase(),
    phone: String(formData.get("phone") || "").trim(),
    platformRoleId: String(formData.get("platformRoleId") || ""),
  };
}

/**
 * Permission ceiling for role *assignment*: only a super admin may hand out the super-admin role.
 * Otherwise an operator with platformUsers.manage could promote themselves to full access.
 */
async function assertMayAssignRole(actor: Awaited<ReturnType<typeof requirePlatformAdmin>>, roleId: string) {
  const role = await getPlatformRole(roleId);
  if (!role || !role.isActive) throw new Error("الدور غير صالح");
  if (role.isSuperAdmin && !actor.platformRoleRef?.isSuperAdmin) {
    throw new Error("لا يمكنك منح دور أعلى من صلاحيتك");
  }
  return role;
}

export async function createPlatformUserAction(formData: FormData) {
  const me = await requirePlatformAdmin();
  assertCanPlatform(me, "platformUsers", "manage");

  const { name, email, phone, platformRoleId } = readForm(formData);
  const password = String(formData.get("password") || "");

  if (!name) return { error: "الاسم مطلوب" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "صيغة البريد الإلكتروني غير صحيحة" };
  try {
    // Shared minimum with every other account-creating path (src/lib/password.ts) — this used to be
    // 6 here, 12 in prisma/bootstrap.ts, and nothing at all for company employees and drivers.
    assertPasswordStrength(password);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "كلمة المرور غير صالحة" };
  }

  try {
    await assertMayAssignRole(me, platformRoleId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "الدور غير صالح" };
  }

  let created;
  try {
    created = await createPlatformUser({
      name,
      email,
      phone: phone || undefined,
      platformRoleId,
      status: String(formData.get("status") || "ACTIVE"),
      password,
    });
  } catch (e) {
    if (isDuplicateEmail(e)) return { error: "البريد الإلكتروني مستخدم من قبل حساب آخر" };
    return { error: "تعذّر إضافة المستخدم" };
  }

  await logAudit({ userId: me.id, action: "CREATE", entityType: "PlatformUser", entityId: created.id });
  revalidatePath("/platform/users");
}

/** One-time reset link for a platform staff account — same authority that already creates and
 *  disables them. Scoped to PLATFORM_ADMIN rows so this can never be pointed at a tenant's user;
 *  resetting those is the company-detail action, which carries the `companies.manage` permission. */
export async function resetPlatformUserPasswordAction(userId: string) {
  return actionResult(async () => {
    const me = await requirePlatformAdmin();
    assertCanPlatform(me, "platformUsers", "manage");

    const target = await prisma.user.findFirst({ where: { id: userId, userType: "PLATFORM_ADMIN" } });
    if (!target) throw new Error("المستخدم غير موجود");

    const { token, expiresAt } = await createPasswordReset(target.id, me.id);
    return { url: resetUrlFor(token), expiresAt: expiresAt.toISOString(), name: target.name };
  }, "تعذّر إصدار رابط إعادة التعيين");
}

export async function updatePlatformUserAction(userId: string, formData: FormData) {
  const me = await requirePlatformAdmin();
  assertCanPlatform(me, "platformUsers", "manage");

  const { name, email, phone, platformRoleId } = readForm(formData);
  if (!name) return { error: "الاسم مطلوب" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "صيغة البريد الإلكتروني غير صحيحة" };

  const target = await getPlatformUser(userId);
  if (!target) return { error: "المستخدم غير موجود" };

  try {
    await assertMayAssignRole(me, platformRoleId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "الدور غير صالح" };
  }

  // Demoting the last super admin would leave the console unmanageable.
  if (target.platformRoleRef?.isSuperAdmin && platformRoleId !== target.platformRoleId) {
    if ((await countActiveSuperAdmins(userId)) === 0) {
      return { error: "لا يمكن تغيير دور آخر مدير منصة نشط" };
    }
  }

  try {
    await updatePlatformUser(userId, { name, email, phone: phone || null, platformRoleId });
  } catch (e) {
    if (isDuplicateEmail(e)) return { error: "البريد الإلكتروني مستخدم من قبل حساب آخر" };
    return { error: e instanceof Error ? e.message : "تعذّر حفظ التعديلات" };
  }

  await logAudit({ userId: me.id, action: "UPDATE", entityType: "PlatformUser", entityId: userId });
  revalidatePath("/platform/users");
}

export async function setPlatformUserStatusAction(userId: string, status: "ACTIVE" | "DISABLED") {
  const me = await requirePlatformAdmin();
  assertCanPlatform(me, "platformUsers", "manage");

  const target = await getPlatformUser(userId);
  if (!target) return { error: "المستخدم غير موجود" };

  if (status === "DISABLED") {
    if (userId === me.id) return { error: "لا يمكنك إيقاف حسابك الخاص" };
    if (target.platformRoleRef?.isSuperAdmin && (await countActiveSuperAdmins(userId)) === 0) {
      return { error: "لا يمكن إيقاف آخر مدير منصة نشط" };
    }
  }

  try {
    await setPlatformUserStatus(userId, status);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر تغيير الحالة" };
  }

  await logAudit({
    userId: me.id,
    action: status === "ACTIVE" ? "ENABLE" : "DISABLE",
    entityType: "PlatformUser",
    entityId: userId,
  });
  revalidatePath("/platform/users");
}

/** Read-only helper for the page — mirrors the guard so buttons match what the server allows. */
export async function currentUserCanManageUsers() {
  const me = await requirePlatformAdmin();
  return canPlatform(me, "platformUsers", "manage");
}
