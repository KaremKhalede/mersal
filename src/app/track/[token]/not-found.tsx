import { PackageX } from "lucide-react";
import { Package } from "lucide-react";

/**
 * The customer-facing 404, shown when a tracking token matches no shipment.
 *
 * Standalone framing on purpose: /track has no app layout, and the audience is a customer on a
 * phone who was sent a link — not an employee. It must never suggest the link "expired", offer a
 * retry (retrying a wrong token cannot help), or hint that some other token would have worked.
 */
export default function TrackNotFound() {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10" dir="rtl">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Package className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-2xl border bg-card px-5 py-10 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <PackageX className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-lg font-bold">لم نجد هذه الشحنة</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            رابط التتبع غير صحيح أو غير مكتمل. تأكد من فتح الرابط كاملاً كما وصلك في رسالة الواتساب.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            إذا استمرت المشكلة، تواصل مع مكتب الشحن الذي أرسل شحنتك وسيزودك برابط جديد.
          </p>
        </div>
      </div>
    </div>
  );
}
