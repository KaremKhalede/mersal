import { requirePlatformAdmin } from "@/lib/auth";
import { requireCanPlatform, canPlatform } from "@/lib/rbac";
import { listPlatformUsers } from "@/modules/platform-users/service";
import { listAssignableRoles } from "@/modules/platform-roles/service";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { FormDialog } from "@/components/shell/form-dialog";
import { UsersToolbar } from "./users-toolbar";
import { PlatformUserRowActions } from "./row-actions";
import { createPlatformUserAction } from "./actions";
import { formatBusinessDate, formatBusinessTime } from "@/lib/timezone";
import { Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** "اليوم 10:30 ص" / "أمس ..." / a date once it stops being useful — same convention as /platform/companies. */
function lastLogin(date: Date | null) {
  if (!date) return { primary: "لم يسجل دخول", secondary: null as string | null };
  const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return { primary: "اليوم", secondary: formatBusinessTime(date) };
  if (days === 1) return { primary: "أمس", secondary: formatBusinessTime(date) };
  return { primary: formatBusinessDate(date), secondary: formatBusinessTime(date) };
}

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; pageSize?: string }>;
}) {
  const me = await requirePlatformAdmin();
  requireCanPlatform(me, "platformUsers", "view");
  const sp = await searchParams;

  const search = sp.q?.trim() ?? "";
  const status = sp.status ?? "";
  const page = Math.max(Number(sp.page) || 1, 1);
  const pageSize = Number(sp.pageSize) || 10;

  const [{ items, total, pageCount }, roles] = await Promise.all([
    listPlatformUsers({ search, status, page, pageSize }),
    listAssignableRoles(),
  ]);

  // Mirrors the server-side guard in actions.ts — buttons are hidden without the permission, and
  // the actions reject the request regardless of what the UI shows.
  const canManage = canPlatform(me, "platformUsers", "manage");
  // Only a super admin may hand out the super-admin role (enforced again server-side).
  const assignableRoles = me.platformRoleRef?.isSuperAdmin ? roles : roles.filter((r) => !r.isSuperAdmin);
  const qs = [search ? `q=${encodeURIComponent(search)}` : "", status ? `status=${status}` : ""]
    .filter(Boolean)
    .join("&");

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">مستخدمي المنصة</h1>
          <p className="text-sm text-muted-foreground">إدارة حسابات موظفي منصة الشحن البري</p>
        </div>

        {canManage && (
          <FormDialog
            trigger={<Button><Plus className="h-4 w-4" /> إضافة مستخدم</Button>}
            title="إضافة مستخدم للمنصة"
            description="حساب جديد بصلاحية الدخول إلى لوحة إدارة المنصة"
            action={createPlatformUserAction}
            submitLabel="إضافة المستخدم"
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-name">الاسم</Label>
              <Input id="new-name" name="name" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-email">البريد الإلكتروني</Label>
                <Input id="new-email" name="email" type="email" dir="ltr" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-phone">رقم الجوال</Label>
                <Input id="new-phone" name="phone" dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-role">الدور</Label>
                <select id="new-role" name="platformRoleId" className={selectClass} required>
                  {assignableRoles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  {assignableRoles.map((r) => r.description).filter(Boolean)[0] ?? "الدور يحدد الصفحات المتاحة للمستخدم"}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-status">الحالة</Label>
                <select id="new-status" name="status" defaultValue="ACTIVE" className={selectClass}>
                  <option value="ACTIVE">نشط</option>
                  <option value="DISABLED">موقوف</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">كلمة المرور</Label>
              <Input id="new-password" name="password" type="password" dir="ltr" required minLength={MIN_PASSWORD_LENGTH} />
            </div>
          </FormDialog>
        )}
      </header>

      <UsersToolbar search={search} status={status} />

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">لا يوجد مستخدمون مطابقون لبحثك</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستخدم</TableHead>
                    <TableHead>البريد الإلكتروني</TableHead>
                    <TableHead>الدور</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>آخر دخول</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((u) => {
                    const roleName = u.platformRoleRef?.name ?? "بلا دور";
                    const login = lastLogin(u.lastLoginAt);
                    const active = u.status === "ACTIVE";
                    return (
                      <TableRow key={u.id} className="transition-colors hover:bg-muted/40">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                              <UserRound className="h-4.5 w-4.5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{u.name}</span>
                              <span className="block truncate text-[11px] text-muted-foreground">{roleName}</span>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell dir="ltr" className="text-sm text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              u.platformRoleRef?.isSuperAdmin
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }
                          >
                            {roleName}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              active
                                ? "border-success/30 bg-success/15 text-success"
                                : "border-destructive/30 bg-destructive/10 text-destructive"
                            )}
                          >
                            {active ? "نشط" : "موقوف"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="block text-sm">{login.primary}</span>
                          {login.secondary && (
                            <span className="block text-[11px] tabular-nums text-muted-foreground">{login.secondary}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {canManage ? (
                            <PlatformUserRowActions user={u} isSelf={u.id === me.id} roles={assignableRoles} />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        itemsShown={items.length}
        itemLabel="مستخدم"
        pageSize={pageSize}
        buildHref={(p) => `/platform/users?page=${p}${qs ? `&${qs}` : ""}`}
      />
    </div>
  );
}
