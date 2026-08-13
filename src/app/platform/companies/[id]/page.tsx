import { requirePlatformAdmin } from "@/lib/auth";
import { getCompanyDetail } from "@/modules/companies/service";
import { notFound } from "next/navigation";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Truck, Users, Contact } from "lucide-react";

export default async function PlatformCompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin();
  const { id } = await params;
  const company = await getCompanyDetail(id);
  if (!company) notFound();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{company.name}</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="الشحنات" value={company._count.shipments} icon={Package} />
        <StatCard label="الرحلات" value={company._count.trips} icon={Truck} />
        <StatCard label="المستخدمون" value={company._count.users} icon={Users} />
        <StatCard label="العملاء" value={company._count.customers} icon={Contact} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">الفروع ({company.branches.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الفرع</TableHead>
                <TableHead>المدينة</TableHead>
                <TableHead>الدولة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {company.branches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell>{b.city}</TableCell>
                  <TableCell>{b.country}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
