import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { EditRoleForm } from "./edit-role-form";

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "roles", "manage");
  const { id } = await params;
  const role = await prisma.role.findFirst({ where: { id, companyId: user.companyId! } });
  if (!role) notFound();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">تعديل الدور: {role.name}</h2>
      <div className="rounded-xl border bg-card p-6">
        <EditRoleForm role={role} />
      </div>
    </div>
  );
}
