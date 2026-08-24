import { requireCompanyUser } from "@/lib/auth";
import { formatPhoneDisplay } from "@/lib/phone";
import { globalSearch } from "@/modules/reports/service";
import { getBranchScope } from "@/lib/branch-scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShipmentStatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { SearchInput } from "@/components/shell/search-input";
import { EmptyState } from "@/components/feedback/empty-state";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireCompanyUser();
  const { q = "" } = await searchParams;
  const results = await globalSearch(user.companyId!, q, getBranchScope(user));
  const total = results.shipments.length + results.customers.length + results.trips.length;

  return (
    <div className="space-y-4">
      {/* No query yet is a normal state here, not an error: the phone's topbar search icon opens
          this page empty, and the field below is where the query is typed. */}
      <PageHeader title={q ? `نتائج البحث عن "${q}"` : "البحث"} />

      {/* The same field as the desktop topbar, pre-filled — a mistyped shipment number is corrected
          here instead of going back a page to retype it. Plain GET, so the query stays in the URL
          and the result is linkable and refreshable. */}
      <form action="/app/search" className="max-w-md">
        <SearchInput defaultValue={q} placeholder="ابحث عن شحنة، عميل، رحلة..." />
      </form>

      {results.shipments.length > 0 && (
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
          </CardContent>
        </Card>
      )}

      {results.customers.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">العملاء</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {results.customers.map((c) => (
              <Link key={c.id} href={`/app/customers/${c.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent text-sm">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground" dir="ltr">{formatPhoneDisplay(c.phone)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {results.trips.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">الرحلات</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {results.trips.map((t) => (
              <Link key={t.id} href={`/app/trips/${t.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent text-sm">
                <span className="font-medium">{t.tripNumber}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* One message for the whole page. Three cards each saying "لا توجد نتائج" told the user
          three times what is one fact — and a one-hit search buried its single result between two
          empty boxes. */}
      {total === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={SearchX}
              title={q ? "لا توجد نتائج" : "ابحث في شحناتك"}
              description={
                q
                  ? `لم يطابق "${q}" أي شحنة أو عميل أو رحلة. جرّب رقم شحنة، اسم عميل، أو رقم رحلة.`
                  : "اكتب رقم شحنة، اسم عميل أو جواله، أو رقم رحلة."
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
