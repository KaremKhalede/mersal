import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EditRoleForm } from "./edit-role-form";
import { PermissionGrid } from "../permission-grid";
import type { Permissions } from "@/lib/enums";

function BackToRoles() {
  return (
    <Link href="/app/roles" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronRight className="h-4 w-4" /> رجوع إلى الأدوار
    </Link>
  );
}

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "roles", "manage");
  const { id } = await params;
  const role = await prisma.role.findFirst({ where: { id, companyId: user.companyId! }, include: { _count: { select: { users: true } } } });
  if (!role) notFound();

  if (role.isSystem) {
    return (
      <div className="space-y-4">
        <BackToRoles />
        <h2 className="text-xl font-bold">{role.name} <span className="text-sm font-normal text-muted-foreground">(دور نظام أساسي)</span></h2>
        <p className="text-sm text-muted-foreground">هذا الدور مطلوب لإدارة الشركة ولا يمكن تعديله أو تعطيله أو حذفه — يملك جميع الصلاحيات دائمًا.</p>
        <div className="rounded-xl border bg-card p-6">
          <p className="mb-1.5 text-sm font-medium">الصلاحيات</p>
          <PermissionGrid defaultPermissions={JSON.parse(role.permissions) as Permissions} readOnly />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <BackToRoles />
      <h2 className="text-xl font-bold">تعديل الدور: {role.name}</h2>
      <div className="rounded-xl border bg-card p-6">
        <EditRoleForm role={role} userCount={role._count.users} />
      </div>
    </div>
  );
}
