import { Bell, Search } from "lucide-react";
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
    <header className="flex items-center justify-between gap-4 border-b bg-card px-4 py-3 lg:px-6 print:hidden">
      <div className="flex items-center gap-2 min-w-0">
        {mobileNav}
        {/* Was an <h1> with `shrink-0 truncate` — two problems. The classes cancel out (a box that
            refuses to shrink never reaches the width where the ellipsis applies, so a long company
            name overran the notification bell at 390px instead of clipping), and now that every
            page renders its own <h1> via PageHeader, a second one in the chrome would give each
            mobile screen two competing page titles. */}
        <p className="truncate text-lg font-bold lg:hidden">{title}</p>
      </div>
      {searchAction && (
        <form action={searchAction} className="hidden lg:block flex-1 max-w-md">
          <SearchInput placeholder="ابحث عن شحنة، عميل، رحلة..." />
        </form>
      )}
      <div className="flex items-center gap-1 shrink-0">
        {/* Below lg the inline field has no room next to the company name, the bell and the user
            menu — so anything narrower than the desktop layout gets the icon, and /app/search itself
            is the search screen, which is also the only way that page is reachable without a
            desktop topbar. */}
        {searchAction && (
          <Link
            href={searchAction}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent lg:hidden"
            aria-label="البحث"
          >
            <Search className="h-5 w-5 text-muted-foreground" />
          </Link>
        )}
        {notificationsHref && (
          <Link
            href={notificationsHref}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
            aria-label="الإشعارات"
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
            {notificationsCount > 0 && (
              <span className="absolute top-1 end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-bold text-destructive-foreground">
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
