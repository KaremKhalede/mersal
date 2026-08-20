"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/auth";
import { assertCanPlatform, permissionsAboveCeiling, sanitizePlatformPermissions } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { PLATFORM_PERMISSION_RESOURCES, type PlatformResource, type PlatformPermissions } from "@/lib/enums";
import { createPlatformRole, updatePlatformRole, getPlatformRole } from "@/modules/platform-roles/service";
import { countActiveSuperAdmins } from "@/modules/platform-roles/service";

/**
 * Checkboxes arrive as `perm:<resource>.<action>`. Parsed through the registry, so a hand-crafted
 * POST naming an unknown resource is dropped rather than stored.
 */
function readPermissions(formData: FormData): PlatformPermissions {
  const raw: Record<string, string[]> = {};
  for (const key of formData.keys()) {
    if (!key.startsWith("perm:")) continue;
    const [resource, action] = key.slice(5).split(".");
    if (!resource || !action) continue;
    (raw[resource] ??= []).push(action);
  }
  return sanitizePlatformPermissions(raw);
}

/** Nobody may grant what they don't hold themselves — checked server-side, every time. */
function assertWithinCeiling(permissions: PlatformPermissions, actor: Parameters<typeof permissionsAboveCeiling>[1]) {
  const excess = permissionsAboveCeiling(permissions, actor);
  if (excess.length > 0) {
    throw new Error("لا يمكنك منح صلاحيات أعلى من صلاحياتك");
  }
}

export async function createPlatformRoleAction(formData: FormData) {
  const me = await requirePlatformAdmin();
  assertCanPlatform(me, "settings", "manage");

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "اسم الدور مطلوب" };

  const permissions = readPermissions(formData);
  try {
    assertWithinCeiling(permissions, me);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "صلاحيات غير مسموحة" };
  }

  let created;
  try {
    created = await createPlatformRole({
      name,
      description: String(formData.get("description") || "").trim() || undefined,
      permissions,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "اسم الدور مستخدم بالفعل" };
    }
    return { error: "تعذّر إنشاء الدور" };
  }

  await logAudit({ userId: me.id, action: "CREATE", entityType: "PlatformRole", entityId: created.id });
  revalidatePath("/platform/settings");
}

export async function updatePlatformRoleAction(roleId: string, formData: FormData) {
  const me = await requirePlatformAdmin();
  assertCanPlatform(me, "settings", "manage");

  const role = await getPlatformRole(roleId);
  if (!role) return { error: "الدور غير موجود" };

  const permissions = readPermissions(formData);
  try {
    assertWithinCeiling(permissions, me);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "صلاحيات غير مسموحة" };
  }

  const isActive = formData.get("isActive") !== null;
  // Deactivating the super-admin role would revoke the console from its holders at once.
  if (role.isSuperAdmin && !isActive) return { error: "لا يمكن تعطيل دور مدير المنصة" };
  if (role.isSuperAdmin && (await countActiveSuperAdmins()) === 0) {
    return { error: "لا يوجد مدير منصة نشط" };
  }

  const name = String(formData.get("name") || "").trim();
  if (!role.isSystem && !name) return { error: "اسم الدور مطلوب" };

  try {
    await updatePlatformRole(roleId, {
      name,
      description: String(formData.get("description") || "").trim() || null,
      // A super-admin role's permission set is irrelevant (the flag grants everything) and editing
      // it would only create the illusion of a restricted super admin.
      permissions: role.isSuperAdmin ? undefined : permissions,
      isActive,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "اسم الدور مستخدم بالفعل" };
    }
    return { error: "تعذّر حفظ الدور" };
  }

  await logAudit({ userId: me.id, action: "UPDATE", entityType: "PlatformRole", entityId: roleId });
  revalidatePath("/platform/settings");
  revalidatePath(`/platform/settings/roles/${roleId}`);
}

/** Resource/action pairs for the matrix UI, straight from the registry. */
export async function permissionMatrix() {
  return Object.entries(PLATFORM_PERMISSION_RESOURCES).map(([resource, actions]) => ({
    resource: resource as PlatformResource,
    actions: [...actions],
  }));
}
