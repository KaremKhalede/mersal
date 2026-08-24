import { ShipmentStatusBadge } from "@/components/ui/status-badge";
import { Boxes, CheckCircle2, Circle, PackageOpen, PackageCheck } from "lucide-react";

/**
 * The statuses worth a badge on a driver's phone: the ones that change what happens at the counter.
 *
 * Every row used to carry one, so a normal loading list repeated "جاهزة للتحميل" down the screen —
 * a label restating the heading above it ("للتحميل هنا") once per shipment. What a driver actually
 * has to notice is the shipment that is NOT normal, and a badge on every row is the surest way to
 * make the one that matters invisible.
 */
const NOTABLE_STATUSES = new Set(["PARTIALLY_ARRIVED", "EXCEPTION", "CANCELLED"]);

export type ManifestRow = {
  id: string;
  shipmentNumber: string;
  totalCartons: number;
  arrivedCartons: number;
  destination: string;
  status: string;
  done: boolean;
};

/**
 * What the driver is standing in front of at this stop.
 *
 * Before this, the stop showed a count and nothing else: "تأكيد التحميل (3)" with no way to know
 * which three, how many cartons, or whether the pallet by the door belongs on this truck. Everything
 * here comes from the trip query the page already runs (getTripDetail includes each stop's links
 * with their shipment) — no extra fetch, and no per-carton scanning, which is a separate piece of
 * work entirely.
 *
 * Deliberately four columns of information and no more. The driver does not need the customer's
 * name, phone, price, or notes to move a box, and putting them on a phone screen at a loading dock
 * costs the fields that do matter their space.
 */
export function StopManifest({ kind, rows }: { kind: "LOAD" | "UNLOAD"; rows: ManifestRow[] }) {
  if (rows.length === 0) return null;

  const done = rows.filter((r) => r.done);
  const pending = rows.filter((r) => !r.done);
  const pendingCartons = pending.reduce((sum, r) => sum + r.totalCartons, 0);
  const totalCartons = rows.reduce((sum, r) => sum + r.totalCartons, 0);
  const Icon = kind === "LOAD" ? PackageCheck : PackageOpen;

  return (
    <div className="rounded-lg border bg-background">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b p-3">
        <span className="flex items-center gap-1.5 font-semibold">
          <Icon className="h-4 w-4 text-primary" />
          {kind === "LOAD" ? "للتحميل هنا" : "للتفريغ هنا"}
        </span>
        {/* The two totals the driver is accountable for, before any per-shipment detail. */}
        <span data-testid="manifest-totals" className="text-sm text-muted-foreground">
          {rows.length} شحنة · {totalCartons} كرتون
        </span>
        <span className={`ms-auto text-sm font-medium ${pending.length === 0 ? "text-success" : "text-primary"}`}>
          {pending.length === 0 ? "اكتمل" : `تم ${done.length} من ${rows.length}`}
        </span>
      </div>

      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.id} data-testid={`manifest-row-${row.shipmentNumber}`} className="flex items-start gap-3 p-3">
            {row.done ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            ) : (
              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {/* nowrap: a shipment number broken across two lines on a phone stops being a single
                    identifier the driver can match against the label on the box. */}
                <span className="whitespace-nowrap font-semibold" dir="ltr">{row.shipmentNumber}</span>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Boxes className="h-3.5 w-3.5" /> {row.totalCartons} كرتون
                </span>
              </div>
              <p className="text-sm text-muted-foreground">إلى {row.destination}</p>
              {/* A shipment that arrived short must say so on the screen where the driver is about
                  to hand it over, not only in the office's records. */}
              {row.status === "PARTIALLY_ARRIVED" && (
                <p className="text-sm font-medium text-warning">وصل {row.arrivedCartons} من {row.totalCartons} كراتين</p>
              )}
            </div>
            {NOTABLE_STATUSES.has(row.status) && <ShipmentStatusBadge status={row.status} />}
          </li>
        ))}
      </ul>

      {/* Only once part of the list is done. Before the first confirmation "المتبقي" is the same two
          numbers as the totals in the header, three lines above it — the driver reads a second line
          to learn nothing. It earns its place the moment the two figures diverge. */}
      {pending.length > 0 && done.length > 0 && (
        <p data-testid="manifest-remaining" className="border-t p-3 text-sm text-muted-foreground">
          المتبقي: {pending.length} شحنة · {pendingCartons} كرتون
        </p>
      )}
    </div>
  );
}
