import { prisma } from "@/lib/db";
import type { PlatformPermissions } from "@/lib/enums";

/** Roles with how many accounts hold them — the role-management list. */
export async function listPlatformRoles() {
  const roles = await prisma.platformRole.findMany({
    orderBy: [{ isSuperAdmin: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { users: true } } },
  });
  return roles.map((r) => ({ ...r, userCount: r._count.users }));
}

/** Assignable roles for the user dialogs — inactive roles must not be handed out. */
export async function listAssignableRoles() {
  return prisma.platformRole.findMany({
    where: { isActive: true },
    orderBy: [{ isSuperAdmin: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, description: true, isSuperAdmin: true },
  });
}

export async function getPlatformRole(roleId: string) {
  return prisma.platformRole.findUnique({ where: { id: roleId } });
}

/** How many accounts can still administer everything — the lockout guard's input. */
export async function countActiveSuperAdmins(excludeUserId?: string) {
  return prisma.user.count({
    where: {
      userType: "PLATFORM_ADMIN",
      status: "ACTIVE",
      platformRoleRef: { isSuperAdmin: true, isActive: true },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}

export async function createPlatformRole(data: {
  name: string;
  description?: string;
  permissions: PlatformPermissions;
}) {
  return prisma.platformRole.create({
    data: {
      name: data.name,
      description: data.description,
      permissions: JSON.stringify(data.permissions),
    },
    select: { id: true },
  });
}

/**
 * System roles keep their name and their super-admin flag; only their permission set is editable.
 * That keeps "مدير المنصة" recognisable and prevents a super-admin role being silently downgraded.
 */
export async function updatePlatformRole(
  roleId: string,
  data: { name?: string; description?: string | null; permissions?: PlatformPermissions; isActive?: boolean }
) {
  const role = await prisma.platformRole.findUniqueOrThrow({ where: { id: roleId } });
  return prisma.platformRole.update({
    where: { id: roleId },
    data: {
      ...(role.isSystem ? {} : { name: data.name, isActive: data.isActive }),
      description: data.description,
      ...(data.permissions ? { permissions: JSON.stringify(data.permissions) } : {}),
    },
  });
}

export function parsePermissions(json: string): PlatformPermissions {
  try {
    return JSON.parse(json) as PlatformPermissions;
  } catch {
    return {};
  }
}
