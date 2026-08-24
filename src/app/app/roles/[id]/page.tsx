import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { EditRoleForm } from "./edit-role-form";
import { PermissionGrid } from "../permission-grid";
import type { Permissions } from "@/lib/enums";
import { PageHeader } from "@/components/shell/page-header";

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "roles", "manage");
  const { id } = await params;
  const role = await prisma.role.findFirst({ where: { id, companyId: user.companyId! }, include: { _count: { select: { users: true } } } });
  if (!role) notFound();

  if (role.isSystem) {
    return (
      <div className="space-y-4">
        <PageHeader
          variant="record"
          title={role.name}
          description="هذا الدور مطلوب لإدارة الشركة ولا يمكن تعديله أو تعطيله أو حذفه — يملك جميع الصلاحيات دائمًا."
          badge={<span className="text-sm font-normal text-muted-foreground">(دور نظام أساسي)</span>}
          parent={{ label: "الأدوار والصلاحيات", href: "/app/roles" }}
        />
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-1.5 text-sm font-medium">الصلاحيات</p>
          <PermissionGrid defaultPermissions={JSON.parse(role.permissions) as Permissions} readOnly />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        variant="record"
        title={role.name}
        description="تعديل صلاحيات هذا الدور"
        parent={{ label: "الأدوار والصلاحيات", href: "/app/roles" }}
      />
      <div className="rounded-xl border bg-card p-4">
        <EditRoleForm role={role} userCount={role._count.users} />
      </div>
    </div>
  );
}
