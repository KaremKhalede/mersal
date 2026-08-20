import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getTripManifest } from "@/modules/trips/service";
import { getBranchScope } from "@/lib/branch-scope";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";
import { PrintButton } from "@/components/labels/print-button";
import { formatBusinessDateTime } from "@/lib/timezone";
import { VEHICLE_TYPE_LABELS, type VehicleType } from "@/lib/enums";

function Field({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium" dir={ltr ? "ltr" : undefined}>{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

export default async function TripManifestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "trips", "view");
  const { id } = await params;
  const data = await getTripManifest(user.companyId!, id, getBranchScope(user));
  if (!data) notFound();

  const { trip, origin, destination, shipments, totalCartons, totalWeightKg } = data;
  const issuedAt = formatBusinessDateTime(new Date(), { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="p-4 print:p-0">
      <div className="print:hidden mb-4 flex items-center justify-between flex-wrap gap-2">
        <Link href={`/app/trips/${trip.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-4 w-4" /> رجوع إلى الرحلة
        </Link>
        <PrintButton>طباعة كشف الحمولة</PrintButton>
      </div>

      <div dir="rtl" className="mx-auto max-w-[210mm] space-y-5 rounded-xl border bg-card p-6 print:max-w-none print:space-y-4 print:rounded-none print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white"
              style={{ backgroundColor: user.company!.logoColor }}
            >
              {user.company!.name.trim().slice(0, 1)}
            </span>
            <p className="font-bold">{user.company!.name}</p>
          </div>
          <div className="text-left">
            <h1 className="flex items-center justify-end gap-1.5 text-lg font-bold">
              <ClipboardList className="h-4 w-4" /> كشف حمولة الرحلة
            </h1>
            <p className="text-xs text-muted-foreground">Manifest</p>
            <p className="text-xs text-muted-foreground mt-1">تاريخ الإصدار: {issuedAt}</p>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">بيانات الرحلة</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="رقم الرحلة" value={trip.tripNumber} />
            <Field label="تاريخ الرحلة" value={formatBusinessDateTime(trip.createdAt, { year: "numeric", month: "numeric", day: "numeric" })} />
            <Field label="نوع الرحلة" value="بري" />
            <Field label="من" value={origin?.name ?? "—"} />
            <Field label="إلى" value={destination?.name ?? "—"} />
            <Field label="السائق" value={trip.driver?.name ?? "لم يُعيّن سائق"} />
            <Field label="رقم جوال السائق" value={trip.driver?.phone ?? "—"} ltr={Boolean(trip.driver?.phone)} />
            <Field label="المركبة" value={trip.vehicle ? (VEHICLE_TYPE_LABELS[trip.vehicle.type as VehicleType] ?? trip.vehicle.type ?? "—") : "لم تُعيّن مركبة"} />
            <Field label="رقم اللوحة" value={trip.vehicle?.plateNumber ?? "—"} ltr={Boolean(trip.vehicle?.plateNumber)} />
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">ملخص الرحلة</p>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="إجمالي الشحنات" value={String(shipments.length)} />
            <Stat label="إجمالي الكراتين" value={String(totalCartons)} />
            <Stat label="إجمالي الوزن" value={totalWeightKg != null ? `${totalWeightKg.toLocaleString("en-US")} كجم` : "غير متوفر"} />
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">تفاصيل الشحنات ({shipments.length})</p>
          {shipments.length === 0 ? (
            <p className="rounded-lg border py-6 text-center text-sm text-muted-foreground">لا توجد شحنات مرتبطة بهذه الرحلة بعد</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-right">
                    <th className="p-2 font-medium">رقم الشحنة</th>
                    <th className="p-2 font-medium">العميل / الشاحن</th>
                    <th className="p-2 font-medium">المستلم</th>
                    <th className="p-2 font-medium">الوجهة</th>
                    <th className="p-2 font-medium">الكراتين</th>
                    <th className="p-2 font-medium">الوزن</th>
                    <th className="p-2 font-medium">نوع البضاعة</th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((s) => (
                    <tr key={s.id} className="border-t break-inside-avoid">
                      <td className="p-2 font-medium" dir="ltr">{s.shipmentNumber}</td>
                      <td className="p-2">{s.customer.name}</td>
                      <td className="p-2">{s.receiverName}</td>
                      <td className="p-2">{s.unloadBranch.name}</td>
                      <td className="p-2">{s.totalCartons}</td>
                      <td className="p-2">{s.weightKg != null ? `${s.weightKg.toLocaleString("en-US")} كجم` : "—"}</td>
                      <td className="p-2">{s.goodsType ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="p-2" colSpan={4}>الإجمالي</td>
                    <td className="p-2">{totalCartons}</td>
                    <td className="p-2">{totalWeightKg != null ? `${totalWeightKg.toLocaleString("en-US")} كجم` : "—"}</td>
                    <td className="p-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-lg border p-2.5 text-sm text-muted-foreground">
          ملاحظات: كشف حمولة تشغيلي داخلي، وليس مانيفستًا جمركيًا رسميًا أو بديلًا عن مستندات الجمارك.
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium mb-6">توقيع السائق</p>
            <p className="text-muted-foreground">الاسم: {trip.driver?.name ?? "—"}</p>
            <p className="text-muted-foreground mt-4">التوقيع: __________________</p>
            <p className="text-muted-foreground mt-4">التاريخ: __________________</p>
          </div>
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium mb-6">اعتماد الشركة</p>
            <p className="text-muted-foreground">الاسم: __________________</p>
            <p className="text-muted-foreground mt-4">التوقيع: __________________</p>
            <p className="text-muted-foreground mt-4">التاريخ: __________________</p>
          </div>
        </div>
      </div>
    </div>
  );
}
