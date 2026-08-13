"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { createRole, updateRole, deleteRole } from "@/modules/roles/service";
import { assertCan } from "@/lib/rbac";
import { PERMISSION_RESOURCES, type Permissions, type PermissionResource } from "@/lib/enums";

function permissionsFromFormData(formData: FormData): Permissions {
  const perms: Permissions = {};
  for (const resource of Object.keys(PERMISSION_RESOURCES) as PermissionResource[]) {
    const actions = formData.getAll(`perm_${resource}`).map(String);
    if (actions.length) perms[resource] = actions;
  }
  return perms;
}

export async function createRoleAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "roles", "manage");

  await createRole({
    companyId: user.companyId!,
    name: String(formData.get("name")),
    description: String(formData.get("description") || ""),
    permissions: permissionsFromFormData(formData),
  });

  revalidatePath("/app/roles");
}

export async function updateRoleAction(roleId: string, formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "roles", "manage");

  try {
    await updateRole(user.companyId!, roleId, {
      name: String(formData.get("name")),
      description: String(formData.get("description") || ""),
      permissions: permissionsFromFormData(formData),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر الحفظ" };
  }

  revalidatePath("/app/roles");
  revalidatePath(`/app/roles/${roleId}`);
}

export async function deleteRoleAction(roleId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "roles", "manage");
  await deleteRole(user.companyId!, roleId);
  revalidatePath("/app/roles");
}
