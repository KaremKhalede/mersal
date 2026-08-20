import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { requireCanPlatform, platformPermissionsOf } from "@/lib/rbac";
import { getPlatformRole, parsePermissions } from "@/modules/platform-roles/service";
import {
  PLATFORM_PERMISSION_RESOURCES,
  PLATFORM_RESOURCE_LABELS,
  PLATFORM_ACTION_LABELS,
  type PlatformResource,
} from "@/lib/enums";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { RoleForm } from "./role-form";

export default async function PlatformRoleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePlatformAdmin();
  requireCanPlatform(me, "settings", "manage");

  const { id } = await params;
  const role = await getPlatformRole(id);
  if (!role) notFound();

  const granted = parsePermissions(role.permissions);
  // The actor's own permissions are the ceiling — anything above it renders disabled, and the
  // server rejects it too if the checkbox is forced.
  const ceiling = new Set(platformPermissionsOf(me));

  const matrix = Object.entries(PLATFORM_PERMISSION_RESOURCES).map(([resource, actions]) => ({
    resource: resource as PlatformResource,
    actions: actions.map((action) => ({
      action,
      key: `${resource}.${action}`,
      checked: Boolean(granted[resource as PlatformResource]?.includes(action)),
      allowed: ceiling.has(`${resource}.${action}`),
    })),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/platform/settings" className="hover:text-foreground">إعدادات المنصة</Link>
          <ChevronLeft className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">{role.name}</span>
        </nav>
        <Link
          href="/platform/settings"
          className="inline-flex items-center gap-1 rounded-lg border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" /> رجوع إلى الإعدادات
        </Link>
      </div>

      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{role.name}</h1>
        {role.isSuperAdmin && (
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            <ShieldCheck className="me-1 h-3 w-3" /> صلاحية كاملة
          </Badge>
        )}
        {role.isSystem && <Badge variant="outline" className="bg-muted text-muted-foreground">دور نظامي</Badge>}
      </header>

      {role.isSuperAdmin ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">
              هذا الدور يملك كل الصلاحيات تلقائياً، بما فيها أي صلاحية تُضاف مستقبلاً. لا يمكن تقييده أو تعطيله
              حتى لا تفقد المنصة إدارتها.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="description">الوصف</Label>
              <Input id="description" defaultValue={role.description ?? ""} disabled />
            </div>
          </CardContent>
        </Card>
      ) : (
        <RoleForm
          roleId={role.id}
          name={role.name}
          description={role.description ?? ""}
          isSystem={role.isSystem}
          isActive={role.isActive}
          matrix={matrix.map((m) => ({
            resource: m.resource,
            label: PLATFORM_RESOURCE_LABELS[m.resource],
            actions: m.actions.map((a) => ({ ...a, label: PLATFORM_ACTION_LABELS[a.action] ?? a.action })),
          }))}
        />
      )}
    </div>
  );
}
