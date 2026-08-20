import { prisma } from "@/lib/db";
import type { Permissions } from "@/lib/enums";

export async function listRoles(companyId: string) {
  return prisma.role.findMany({ where: { companyId }, include: { _count: { select: { users: true } } }, orderBy: { createdAt: "asc" } });
}

export async function createRole(params: { companyId: string; name: string; description?: string; permissions: Permissions }) {
  return prisma.role.create({
    data: { companyId: params.companyId, name: params.name, description: params.description, permissions: JSON.stringify(params.permissions) },
  });
}

export async function updateRole(companyId: string, roleId: string, params: { name?: string; description?: string; permissions?: Permissions; isActive?: boolean }) {
  const role = await prisma.role.findFirstOrThrow({ where: { id: roleId, companyId } });
  // The system role ("مدير الشركة") is frozen entirely — name, description, permissions, and
  // active state — so a company can never edit, disable, or otherwise lock itself out of having
  // at least one fully-privileged role.
  if (role.isSystem) throw new Error("لا يمكن تعديل دور النظام الأساسي");
  return prisma.role.update({
    where: { id: role.id },
    data: {
      name: params.name,
      description: params.description,
      permissions: params.permissions ? JSON.stringify(params.permissions) : undefined,
      isActive: params.isActive,
    },
  });
}

export async function deleteRole(companyId: string, roleId: string) {
  const role = await prisma.role.findFirstOrThrow({ where: { id: roleId, companyId }, include: { _count: { select: { users: true } } } });
  if (role.isSystem) throw new Error("لا يمكن حذف دور النظام الأساسي");
  if (role._count.users > 0) throw new Error("لا يمكن حذف هذا الدور لأنه مرتبط بموظفين.");
  return prisma.role.delete({ where: { id: role.id } });
}
