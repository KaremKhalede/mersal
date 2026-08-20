"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { createRole, updateRole, deleteRole } from "@/modules/roles/service";
import { assertCan, can } from "@/lib/rbac";
import { Prisma } from "@prisma/client";
import { PERMISSION_RESOURCES, type Permissions, type PermissionResource } from "@/lib/enums";

function permissionsFromFormData(formData: FormData): Permissions {
  const perms: Permissions = {};
  for (const resource of Object.keys(PERMISSION_RESOURCES) as PermissionResource[]) {
    const actions = formData.getAll(`perm_${resource}`).map(String);
    if (actions.length) perms[resource] = actions;
  }
  return perms;
}

/**
 * Permission ceiling: nobody can grant a role more than they themselves currently hold — covers
 * self-escalation (editing your own role), granting a colleague more than you have, and building a
 * de-facto administrator role, all with one rule. The company-wide bypass role ("مدير الشركة" /
 * "company_admin") already holds every permission via `can()`, so it's never blocked by this.
 */
function exceedsOwnPermissions(user: Parameters<typeof can>[0], requested: Permissions): boolean {
  for (const [resource, actions] of Object.entries(requested) as [PermissionResource, string[]][]) {
    for (const action of actions) {
      if (!can(user, resource, action)) return true;
    }
  }
  return false;
}

function isDuplicateName(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && (e.meta?.target as string[] | undefined)?.includes("name");
}

export async function createRoleAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "roles", "manage");

  const permissions = permissionsFromFormData(formData);
  if (exceedsOwnPermissions(user, permissions)) {
    return { error: "لا يمكنك منح صلاحيات لا تملكها أنت نفسك" };
  }

  try {
    await createRole({
      companyId: user.companyId!,
      name: String(formData.get("name") || "").trim(),
      description: String(formData.get("description") || "").trim() || undefined,
      permissions,
    });
  } catch (e) {
    if (isDuplicateName(e)) return { error: "يوجد دور بهذا الاسم مسبقًا" };
    return { error: "تعذّر إنشاء الدور" };
  }

  revalidatePath("/app/roles");
}

export async function updateRoleAction(roleId: string, formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "roles", "manage");

  const permissions = permissionsFromFormData(formData);
  if (exceedsOwnPermissions(user, permissions)) {
    return { error: "لا يمكنك منح صلاحيات لا تملكها أنت نفسك" };
  }

  try {
    await updateRole(user.companyId!, roleId, {
      name: String(formData.get("name") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      permissions,
    });
  } catch (e) {
    if (isDuplicateName(e)) return { error: "يوجد دور بهذا الاسم مسبقًا" };
    return { error: e instanceof Error ? e.message : "تعذّر الحفظ" };
  }

  revalidatePath("/app/roles");
  revalidatePath(`/app/roles/${roleId}`);
}

export async function toggleRoleStatusAction(roleId: string, isActive: boolean) {
  const user = await requireCompanyUser();
  assertCan(user, "roles", "manage");

  try {
    await updateRole(user.companyId!, roleId, { isActive });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر تنفيذ الإجراء" };
  }

  revalidatePath("/app/roles");
  revalidatePath(`/app/roles/${roleId}`);
}

export async function deleteRoleAction(roleId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "roles", "manage");

  try {
    await deleteRole(user.companyId!, roleId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر حذف الدور" };
  }

  revalidatePath("/app/roles");
}
