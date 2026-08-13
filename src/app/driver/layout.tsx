import { requireDriver } from "@/lib/auth";
import { UserMenu } from "@/components/shell/user-menu";
import { Package } from "lucide-react";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const user = await requireDriver();

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="flex items-center justify-between bg-sidebar text-sidebar-foreground px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Package className="h-4 w-4" />
          </div>
          <span className="font-semibold text-sm">تطبيق السائق</span>
        </div>
        <UserMenu name={user.name} subtitle={user.company?.name} />
      </header>
      <main className="flex-1 mx-auto w-full max-w-md p-4">{children}</main>
    </div>
  );
}
