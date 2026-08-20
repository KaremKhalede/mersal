import Link from "next/link";
import { ChevronLeft, Settings } from "lucide-react";
import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { CompanySettingsForm } from "./company-form";

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
    <div className="space-y-5">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/app" className="hover:text-foreground">الرئيسية</Link>
        <ChevronLeft className="h-3.5 w-3.5" />
        <Link href="/app/settings" className="hover:text-foreground">الإعدادات</Link>
        <ChevronLeft className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">إعدادات الشركة</span>
      </nav>

      <header className="space-y-1.5">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Settings className="h-6 w-6 text-muted-foreground" />
          إعدادات الشركة
        </h1>
        <p className="text-sm text-muted-foreground">إدارة المعلومات الأساسية للشركة.</p>
      </header>

      {/* logoKey itself never reaches the client — only whether a logo exists, so the browser knows
          to request /api/company/logo instead of falling back to the color mark. */}
      <CompanySettingsForm company={{ ...company, hasLogo: Boolean(company.logoKey) }} />
    </div>
  );
}
