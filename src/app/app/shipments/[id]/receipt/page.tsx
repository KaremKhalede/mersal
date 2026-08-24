import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getShipmentDetail } from "@/modules/shipments/service";
import { getBranchScope } from "@/lib/branch-scope";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Receipt as ReceiptIcon } from "lucide-react";
import QRCode from "qrcode";
import { PrintButton } from "@/components/labels/print-button";
import { formatDate, formatDateStamp } from "@/lib/timezone";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatAmount, toMoney, toMoneyOrNull, YER } from "@/lib/money";
import { trackingUrlFor } from "@/lib/tracking";
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from "@/lib/enums";

/**
 * إيصال استلام الشحنة — the paper the customer walks out with.
 *
 * ## Why this exists
 *
 * A land-shipping office takes cargo and money across a counter. Until now the only thing that
 * could be printed at that moment was a sheet of carton codes for the boxes — the customer left
 * with nothing at all. That is a gap in two directions: the sender has no record of what they
 * handed over or what they still owe, and the office has no paper to point at when a price or a
 * carton count is disputed weeks later.
 *
 * ## What it is NOT
 *
 * Not an invoice, not a tax document, not a contract, not a waybill with terms and conditions on
 * the back. It states the facts the system already holds — what was handed over, by whom, to whom,
 * for how much, how much was paid — and says so in its own footnote so nobody files it as
 * something it is not. Adding legal or accounting weight to it would mean a compliance surface the
 * product does not have and a lawyer this program has not consulted.
 *
 * ## The QR code
 *
 * The single most useful thing on the page. It carries the customer's own tracking URL — the same
 * link WhatsApp already sends them, which is the credential for /track/<token> — so a customer who
 * later deletes the message, or changes phone, still has a way in that does not begin with a call
 * to the office. Same `qrcode` dependency and same server-rendered-SVG approach the carton label
 * already uses, for the same reason: vector page content prints, background images do not.
 *
 * Follows the document language of the trip manifest, the invoice and the close sheet: outlined
 * identity tile (never a filled one — print engines drop backgrounds), Arabic long-form dates, and
 * a signature line, because a handover is only evidence once someone has signed for it.
 */
export default async function ShipmentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  // Same gate as the shipment page this is printed from — a document is never a second door.
  requireCan(user, "shipments", "view");
  const { id } = await params;
  const shipment = await getShipmentDetail(user.companyId!, id, getBranchScope(user));
  if (!shipment) notFound();

  const price = toMoneyOrNull(shipment.shippingPrice);
  const paid = toMoney(shipment.amountPaid);
  const remaining = price == null ? null : Math.max(0, price - paid);

  // Same path the WhatsApp message uses — one tracking URL shape in the product, so a QR a
  // customer scans and a link they were sent land in the same place. See src/lib/tracking.ts.
  const trackingUrl = trackingUrlFor(shipment.trackingToken);
  const qrSvg = await QRCode.toString(trackingUrl, { type: "svg", margin: 0, width: 104 });

  return (
    <div className="p-4 print:p-0">
      <div className="print:hidden mb-4 flex items-center justify-between flex-wrap gap-2">
        <Link
          href={`/app/shipments/${shipment.id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" /> رجوع إلى الشحنة
        </Link>
        <PrintButton>طباعة الإيصال</PrintButton>
      </div>

      {/* Half-height rather than full A4: this is a counter slip, and a receipt that wastes a whole
          sheet per shipment is a receipt an office stops printing by the second week. */}
      <div dir="rtl" className="mx-auto max-w-[210mm] space-y-4 rounded-xl border bg-card p-6 print:max-w-none print:rounded-none print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 text-base font-bold"
              style={{ borderColor: user.company!.logoColor, color: user.company!.logoColor }}
            >
              {user.company!.name.trim().slice(0, 1)}
            </span>
            <div>
              <p className="font-bold">{user.company!.name}</p>
              {user.company!.phone && (
                <p className="text-xs text-muted-foreground" dir="ltr">{formatPhoneDisplay(user.company!.phone)}</p>
              )}
            </div>
          </div>
          <div className="text-left">
            <h1 className="flex items-center justify-end gap-1.5 text-lg font-bold">
              <ReceiptIcon className="h-4 w-4" /> إيصال استلام شحنة
            </h1>
            <p className="text-xs text-muted-foreground">Shipment Receipt</p>
            <p className="text-xs text-muted-foreground mt-1">تاريخ التسجيل: {formatDate(shipment.createdAt)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">رقم الشحنة</p>
            <p className="text-2xl font-bold tabular-nums" dir="ltr">{shipment.shipmentNumber}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {shipment.loadBranch.name} ← {shipment.unloadBranch.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              الحالة عند الإصدار: {SHIPMENT_STATUS_LABELS[shipment.status as ShipmentStatus] ?? shipment.status}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="h-[104px] w-[104px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <p className="text-2xs text-muted-foreground">امسح لتتبع الشحنة</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Party
            title="المرسِل"
            name={shipment.customer.name}
            phone={shipment.customer.phone}
          />
          <Party
            title="المستلم"
            name={shipment.receiverName}
            phone={shipment.receiverPhone}
          />
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">تفاصيل الشحنة</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="عدد الكراتين" value={String(shipment.totalCartons)} ltr />
            <Field label="نوع البضاعة" value={shipment.goodsType ?? "—"} />
            <Field label="الوزن" value={shipment.weightKg != null ? `${shipment.weightKg.toLocaleString("en-US")} كجم` : "—"} />
            <Field label="فرع الاستلام" value={shipment.unloadBranch.name} />
          </div>
        </div>

        {/*
          The money block, and the reason the customer keeps this piece of paper.

          A shipment registered before its price is agreed is a real case (see createShipmentAction),
          so an unpriced shipment says so in words rather than printing "0" — a receipt claiming a
          zero fare is worse than one that admits the fare is not set yet.
        */}
        <div>
          <p className="text-sm font-semibold mb-2">المبالغ</p>
          <div className="grid grid-cols-3 gap-2">
            <Money label="أجرة الشحن" value={price} />
            <Money label="المدفوع" value={paid} />
            <Money label="المتبقي" value={remaining} emphasis={remaining != null && remaining > 0} />
          </div>
          {shipment.paymentDate && (
            <p className="mt-2 text-xs text-muted-foreground">آخر دفعة: {formatDateStamp(shipment.paymentDate)}</p>
          )}
        </div>

        <div className="rounded-lg border p-2.5 text-xs text-muted-foreground">
          ملاحظات: إيصال تشغيلي بتسجيل الشحنة وما دُفع عنها حتى تاريخ الإصدار — وليس فاتورة ضريبية
          ولا مستنداً جمركياً. تتبّع الشحنة عبر رمز الاستجابة السريعة أعلاه.
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 break-inside-avoid">
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium mb-6">توقيع المرسِل</p>
            <p className="text-muted-foreground">الاسم: {shipment.customer.name}</p>
            <p className="text-muted-foreground mt-4">التوقيع: __________________</p>
          </div>
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium mb-6">موظف الاستلام</p>
            <p className="text-muted-foreground">الاسم: __________________</p>
            <p className="text-muted-foreground mt-4">التوقيع: __________________</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Party({ title, name, phone }: { title: string; name: string; phone: string | null }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="font-medium">{name}</p>
      {phone && <p className="text-sm text-muted-foreground" dir="ltr">{formatPhoneDisplay(phone)}</p>}
    </div>
  );
}

function Field({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium" dir={ltr ? "ltr" : undefined}>{value}</p>
    </div>
  );
}

function Money({ label, value, emphasis }: { label: string; value: number | null; emphasis?: boolean }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      {/* No dir="ltr" here even though the figure is a number: the string ends with the Arabic
          currency word, and forcing the whole element to LTR moves "ر.ي" to the visual left —
          printing "ر.ي 39,000" instead of "39,000 ر.ي". `tabular-nums` is what the digits actually
          needed; direction was never the fix. Same reason the trip manifest's Stat carries none. */}
      <p className={`text-xl font-bold tabular-nums ${emphasis ? "text-warning" : ""}`}>
        {value == null ? "—" : `${formatAmount(value)} ${YER}`}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {value == null && <p className="text-2xs text-muted-foreground/70">لم تُحدَّد بعد</p>}
    </div>
  );
}
