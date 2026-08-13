import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listCustomers } from "@/modules/customers/service";
import { getBranchScope } from "@/lib/branch-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/shell/form-dialog";
import { Plus } from "lucide-react";
import Link from "next/link";
import { createCustomerAction } from "./actions";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "customers", "view");
  const { q, page: pageParam } = await searchParams;
  const page = Number(pageParam || 1);
  const { items: customers, pageCount } = await listCustomers(user.companyId!, q, getBranchScope(user), page);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">العملاء</h2>
        <FormDialog
          trigger={<Button><Plus className="h-4 w-4" /> عميل جديد</Button>}
          title="إضافة عميل جديد"
          action={async (fd) => {
            "use server";
            await createCustomerAction(fd);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">اسم العميل</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">رقم الجوال</Label>
            <Input id="phone" name="phone" dir="ltr" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">العنوان</Label>
            <Input id="address" name="address" />
          </div>
        </FormDialog>
      </div>

      <form className="max-w-sm">
        <Input name="q" defaultValue={q} placeholder="ابحث بالاسم أو رقم الجوال..." />
      </form>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الجوال</TableHead>
                <TableHead>عدد الشحنات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/app/customers/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</Link>
                  </TableCell>
                  <TableCell dir="ltr" className="text-start">{c.phone}</TableCell>
                  <TableCell>{c._count.shipments}</TableCell>
                </TableRow>
              ))}
              {customers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">لا يوجد عملاء</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={`/app/customers?page=${p}${q ? `&q=${q}` : ""}`}
              className={`h-8 w-8 flex items-center justify-center rounded-md border ${p === page ? "bg-primary text-primary-foreground" : ""}`}>
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
