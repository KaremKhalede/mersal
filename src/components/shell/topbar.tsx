import { Search } from "lucide-react";
import { UserMenu } from "./user-menu";

export function Topbar({
  title,
  userName,
  userSubtitle,
  searchAction,
  mobileNav,
}: {
  title: string;
  userName: string;
  userSubtitle?: string;
  searchAction?: string;
  mobileNav?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b bg-card px-4 py-3 md:px-6 print:hidden">
      <div className="flex items-center gap-2 min-w-0">
        {mobileNav}
        <h1 className="text-lg font-bold shrink-0 truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-3 flex-1 justify-end">
        {searchAction && (
          <form action={searchAction} className="relative hidden sm:block w-full max-w-xs">
            <Search className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              name="q"
              placeholder="ابحث برقم الشحنة أو اسم العميل..."
              className="w-full rounded-lg border bg-background py-2 ps-3 pe-9 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </form>
        )}
        <UserMenu name={userName} subtitle={userSubtitle} />
      </div>
    </header>
  );
}
