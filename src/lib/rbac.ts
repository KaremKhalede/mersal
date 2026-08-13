import { redirect } from "next/navigation";
import type { PermissionResource, Permissions } from "@/lib/enums";

/** Company Admin (isSystem role "company_admin") always has full access without needing every key set. */
export function can(
  user: { userType: string; role: { name: string; permissions: string } | null },
  resource: PermissionResource,
  action: string
): boolean {
  if (user.userType === "PLATFORM_ADMIN") return true;
  if (!user.role) return false;
  if (user.role.name === "مدير الشركة" || user.role.name === "company_admin") return true;

  let perms: Permissions = {};
  try {
    perms = JSON.parse(user.role.permissions) as Permissions;
  } catch {
    return false;
  }
  return Boolean(perms[resource]?.includes(action));
}

/**
 * Page-level guard: a role without "view" on a resource must not be able to reach the page by
 * typing the URL directly, even though the sidebar already hides the link. Redirects home instead
 * of throwing, since a forbidden page load is routine (role changed, bookmarked link) not a bug.
 */
export function requireCan(
  user: { userType: string; role: { name: string; permissions: string } | null },
  resource: PermissionResource,
  action: string
) {
  if (!can(user, resource, action)) redirect("/app");
}

export function assertCan(
  user: { userType: string; role: { name: string; permissions: string } | null },
  resource: PermissionResource,
  action: string
) {
  if (!can(user, resource, action)) {
    throw new Error(`FORBIDDEN: missing ${resource}.${action}`);
  }
}
