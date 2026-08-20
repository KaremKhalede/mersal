import { Bell } from "lucide-react";
import Link from "next/link";
import { UserMenu } from "./user-menu";
import { SearchInput } from "./search-input";

export function Topbar({
  title,
  userName,
  userSubtitle,
  searchAction,
  mobileNav,
  notificationsHref,
  notificationsCount = 0,
}: {
  title: string;
  userName: string;
  userSubtitle?: string;
  searchAction?: string;
  mobileNav?: React.ReactNode;
  notificationsHref?: string;
  notificationsCount?: number;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b bg-card px-4 py-3 md:px-6 print:hidden">
      <div className="flex items-center gap-2 min-w-0">
        {mobileNav}
        <h1 className="text-lg font-bold shrink-0 truncate md:hidden">{title}</h1>
      </div>
      {searchAction && (
        <form action={searchAction} className="hidden md:block flex-1 max-w-md">
          <SearchInput placeholder="ابحث عن شحنة، عميل، رحلة..." />
        </form>
      )}
      <div className="flex items-center gap-1 shrink-0">
        {notificationsHref && (
          <Link
            href={notificationsHref}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
            aria-label="الإشعارات"
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
            {notificationsCount > 0 && (
              <span className="absolute top-1 end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.65rem] font-bold text-destructive-foreground">
                {notificationsCount > 9 ? "9+" : notificationsCount}
              </span>
            )}
          </Link>
        )}
        <UserMenu name={userName} subtitle={userSubtitle} />
      </div>
    </header>
  );
}
