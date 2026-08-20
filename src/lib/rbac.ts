import { redirect } from "next/navigation";
import type { PermissionResource, Permissions } from "@/lib/enums";
import {
  PLATFORM_PERMISSION_RESOURCES,
  ALL_PLATFORM_PERMISSIONS,
  type PlatformResource,
  type PlatformPermissions,
} from "@/lib/enums";

// ---------- Platform scope (SaaS operators) ----------

/** The shape every platform check needs — what getCurrentUser() returns for a platform account. */
export type PlatformActor = {
  userType: string;
  platformRoleRef?: { permissions: string; isSuperAdmin: boolean; isActive: boolean } | null;
};

/**
 * Platform-console authorization. Kept entirely separate from `can()` below: that one answers
 * "what may this employee do inside their shipping company", this one answers "what may this SaaS
 * operator do in the admin console". A platform account has no company Role and vice versa.
 *
 * Fail-closed: no role, an inactive role, or malformed JSON grants nothing. A super-admin role
 * grants everything — including permissions added in future releases, which is why it is stored as
 * a flag rather than an exhaustive permission list that would go stale.
 */
export function canPlatform(user: PlatformActor | null | undefined, resource: PlatformResource, action: string): boolean {
  if (!user || user.userType !== "PLATFORM_ADMIN") return false;
  const role = user.platformRoleRef;
  if (!role || role.isActive === false) return false;
  if (role.isSuperAdmin) return true;

  let perms: PlatformPermissions = {};
  try {
    perms = JSON.parse(role.permissions) as PlatformPermissions;
  } catch {
    return false;
  }
  return Boolean(perms[resource]?.includes(action));
}

/**
 * Where to send an operator who lacks the permission for the page they opened: their first
 * reachable destination, in sidebar order. Redirecting everyone to "/platform" unconditionally
 * would loop forever for a role without `dashboard.view` — the dashboard would bounce to itself.
 * An operator who can reach nothing is sent to /login rather than into a cycle.
 */
const PLATFORM_LANDING: { resource: PlatformResource; path: string }[] = [
  { resource: "dashboard", path: "/platform" },
  { resource: "companies", path: "/platform/companies" },
  { resource: "billing", path: "/platform/billing" },
  { resource: "platformUsers", path: "/platform/users" },
  { resource: "settings", path: "/platform/settings" },
];

export function platformLandingPath(user: PlatformActor): string {
  return PLATFORM_LANDING.find((d) => canPlatform(user, d.resource, "view"))?.path ?? "/login";
}

/** Page guard — sends an unauthorized operator to the first page they can actually open. */
export function requireCanPlatform(user: PlatformActor, resource: PlatformResource, action: string) {
  if (!canPlatform(user, resource, action)) redirect(platformLandingPath(user));
}

/** Mutation guard — server actions must throw, never silently no-op. */
export function assertCanPlatform(user: PlatformActor, resource: PlatformResource, action: string) {
  if (!canPlatform(user, resource, action)) {
    throw new Error(`FORBIDDEN: missing ${resource}.${action}`);
  }
}

/** Flat "resource.action" list an actor actually holds — the ceiling for what they may grant. */
export function platformPermissionsOf(user: PlatformActor | null | undefined): string[] {
  if (!user || user.userType !== "PLATFORM_ADMIN") return [];
  const role = user.platformRoleRef;
  if (!role || role.isActive === false) return [];
  if (role.isSuperAdmin) return [...ALL_PLATFORM_PERMISSIONS];

  let perms: PlatformPermissions = {};
  try {
    perms = JSON.parse(role.permissions) as PlatformPermissions;
  } catch {
    return [];
  }
  return Object.entries(perms).flatMap(([resource, actions]) => (actions ?? []).map((a) => `${resource}.${a}`));
}

/**
 * Permission ceiling: nobody may grant what they do not themselves hold. Without this, an operator
 * with only `companies.view` could mint a role with `billing.manage` and assign it to themselves.
 * Returns the offending keys so the caller can report them.
 */
export function permissionsAboveCeiling(granted: PlatformPermissions, actor: PlatformActor): string[] {
  const ceiling = new Set(platformPermissionsOf(actor));
  return Object.entries(granted)
    .flatMap(([resource, actions]) => (actions ?? []).map((a) => `${resource}.${a}`))
    .filter((key) => !ceiling.has(key));
}

/** Drops unknown resources/actions so a tampered payload can't store junk keys. */
export function sanitizePlatformPermissions(input: unknown): PlatformPermissions {
  const out: PlatformPermissions = {};
  if (!input || typeof input !== "object") return out;
  for (const [resource, actions] of Object.entries(input as Record<string, unknown>)) {
    const known = PLATFORM_PERMISSION_RESOURCES[resource as PlatformResource] as readonly string[] | undefined;
    if (!known || !Array.isArray(actions)) continue;
    const kept = actions.filter((a): a is string => typeof a === "string" && known.includes(a));
    if (kept.length) out[resource as PlatformResource] = kept;
  }
  return out;
}

// ---------- Company scope (tenant employees) ----------

/** Company Admin (isSystem role "company_admin") always has full access without needing every key set. */
export function can(
  user: { userType: string; role: { name: string; permissions: string; isActive?: boolean } | null },
  resource: PermissionResource,
  action: string
): boolean {
  if (user.userType === "PLATFORM_ADMIN") return true;
  if (!user.role) return false;
  // A disabled role grants nothing — same as having no role at all. Checked before the admin-bypass
  // name check too: disabling "مدير الشركة" is blocked at the mutation layer (see roles/service.ts),
  // but this is the fail-closed backstop if that were ever bypassed.
  if (user.role.isActive === false) return false;
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
