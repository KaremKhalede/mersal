import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { CompanySettingsForm } from "./company-form";
import { PageHeader } from "@/components/shell/page-header";

export default async function CompanySettingsPage() {
  const user = await requireCompanyUser();
  requireCan(user, "settings", "view");

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: user.companyId! },
    select: {
      name: true,
      nameEn: true,
      description: true,
      phone: true,
      email: true,
      website: true,
      address: true,
      logoColor: true,
      logoKey: true,
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="إعدادات الشركة"
        description="إدارة المعلومات الأساسية للشركة."
        parent={{ label: "الإعدادات", href: "/app/settings" }}
      />

      {/* logoKey itself never reaches the client — only whether a logo exists, so the browser knows
          to request /api/company/logo instead of falling back to the color mark. */}
      <CompanySettingsForm company={{ ...company, hasLogo: Boolean(company.logoKey) }} />
    </div>
  );
}
