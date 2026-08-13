import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toMoney } from "@/lib/money";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Wallet, Boxes } from "lucide-react";

export default async function PlatformBillingPage() {
  await requirePlatformAdmin();

  // Aggregated at the DB level (groupBy + _sum) instead of pulling every ledger row into Node —
  // this stays flat as the platform's transaction volume grows instead of scanning the whole table.
  const [totals, byCompanyRaw] = await Promise.all([
    prisma.billingLedgerEntry.aggregate({ _sum: { amount: true, cartonCount: true } }),
    prisma.billingLedgerEntry.groupBy({ by: ["companyId"], _sum: { amount: true, cartonCount: true } }),
  ]);

  const companies = await prisma.company.findMany({ where: { id: { in: byCompanyRaw.map((r) => r.companyId) } }, select: { id: true, name: true } });
  const nameById = new Map(companies.map((c) => [c.id, c.name]));
  const byCompany = byCompanyRaw
    .map((r) => ({ name: nameById.get(r.companyId) ?? "—", amount: toMoney(r._sum.amount), cartons: r._sum.cartonCount ?? 0 }))
    .sort((a, b) => b.amount - a.amount);
  const totalAmount = toMoney(totals._sum.amount);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">الفوترة ورسوم المنصة</h2>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="إجمالي رسوم المنصة" value={`${totalAmount.toLocaleString()} ر.ي`} icon={Wallet} />
        <StatCard label="إجمالي الكراتين المفوترة" value={totals._sum.cartonCount ?? 0} icon={Boxes} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">الرسوم حسب الشركة</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الشركة</TableHead>
                <TableHead>الكراتين</TableHead>
                <TableHead>الرسوم</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byCompany.map((c) => (
                <TableRow key={c.name}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.cartons}</TableCell>
                  <TableCell>{c.amount.toLocaleString()} ر.ي</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
