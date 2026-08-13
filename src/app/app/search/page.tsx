import { requireCompanyUser } from "@/lib/auth";
import { globalSearch } from "@/modules/reports/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShipmentStatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireCompanyUser();
  const { q = "" } = await searchParams;
  const results = await globalSearch(user.companyId!, q);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">نتائج البحث عن &quot;{q}&quot;</h2>

      <Card>
        <CardHeader><CardTitle className="text-base">الشحنات</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {results.shipments.map((s) => (
            <Link key={s.id} href={`/app/shipments/${s.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent text-sm">
              <span className="font-medium">{s.shipmentNumber}</span>
              <span className="text-muted-foreground">{s.receiverName}</span>
              <ShipmentStatusBadge status={s.status} />
            </Link>
          ))}
          {results.shipments.length === 0 && <p className="text-sm text-muted-foreground">لا توجد نتائج</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">العملاء</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {results.customers.map((c) => (
            <Link key={c.id} href={`/app/customers/${c.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent text-sm">
              <span className="font-medium">{c.name}</span>
              <span className="text-muted-foreground" dir="ltr">{c.phone}</span>
            </Link>
          ))}
          {results.customers.length === 0 && <p className="text-sm text-muted-foreground">لا توجد نتائج</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">الرحلات</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {results.trips.map((t) => (
            <Link key={t.id} href={`/app/trips/${t.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent text-sm">
              <span className="font-medium">{t.tripNumber}</span>
            </Link>
          ))}
          {results.trips.length === 0 && <p className="text-sm text-muted-foreground">لا توجد نتائج</p>}
        </CardContent>
      </Card>
    </div>
  );
}
