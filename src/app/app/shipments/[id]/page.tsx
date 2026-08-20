import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getShipmentDetail, getExceptionReporter, getExceptionRecoveryOptions } from "@/modules/shipments/service";
import { getBranchScope } from "@/lib/branch-scope";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShipmentStatusBadge, CartonStatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Phone, AlertTriangle, User, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ShipmentActions } from "./shipment-actions";
import { ResolveExceptionButton } from "./resolve-exception-button";
import { DocumentsPanel } from "@/app/app/documents/documents-panel";
import { CustomsPanel } from "@/app/app/customs/customs-panel";
import { DeliveryPanel } from "@/app/app/delivery/delivery-panel";
import { formatBusinessDateTime, formatBusinessStamp } from "@/lib/timezone";
import { EXCEPTION_TYPE_LABELS, SHIPMENT_STATUS_LABELS, DELIVERY_CHANNEL_LABELS, type ExceptionType, type ShipmentStatus, type DeliveryChannel } from "@/lib/enums";

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "shipments", "view");
  const { id } = await params;
  const shipment = await getShipmentDetail(user.companyId!, id, getBranchScope(user));
  if (!shipment) notFound();
  const isException = shipment.status === "EXCEPTION";
  const missingCartons = shipment.cartons.filter((c) => c.status === "MISSING");
  const arrivedCartons = shipment.cartons.filter((c) => c.status !== "MISSING");
  // Cartons that were short at handover and turned up afterwards. Kept as tracking events rather
  // than a column on the shipment: it is a dated occurrence, possibly several of them, and the
  // timeline is already where dated occurrences live.
  const lateArrivals = shipment.trackingEvents.filter((e) => e.eventType === "CARTON_ARRIVED_LATE");
  const reporter = isException ? await getExceptionReporter(shipment.id) : null;
  // Derived on the server from the status recorded when the exception was raised, so the buttons
  // can only ever offer moves resolveException will accept.
  const recoveryOptions = isException ? await getExceptionRecoveryOptions(shipment.id) : [];

  return (
    <div className="space-y-4">
      <Link href="/app/shipments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronRight className="h-4 w-4" /> رجوع إلى الشحنات
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{shipment.shipmentNumber}</h2>
            <ShipmentStatusBadge status={shipment.status} />
          </div>
          <p className="text-muted-foreground mt-1">{shipment.loadBranch.name} ← {shipment.unloadBranch.name}</p>
        </div>
        {isException ? (
          <ResolveExceptionButton shipmentId={shipment.id} options={recoveryOptions} />
        ) : (
          <ShipmentActions shipment={shipment} />
        )}
      </div>

      {/* Reported problem, front and center — not buried in the info sidebar — so anyone opening
          this shipment immediately sees what's wrong, who flagged it, and where it happened. */}
      {isException && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-1.5 text-sm">
                <p className="font-medium text-destructive">
                  {EXCEPTION_TYPE_LABELS[shipment.exceptionType as ExceptionType] ?? "استثناء"}
                </p>
                {shipment.exceptionNote && <p className="text-foreground">{shipment.exceptionNote}</p>}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
                  {reporter && (
                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> أبلغ عنها: {reporter.name}</span>
                  )}
                  {shipment.statusBeforeException && (
                    <span>المرحلة عند الإبلاغ: {SHIPMENT_STATUS_LABELS[shipment.statusBeforeException as ShipmentStatus] ?? shipment.statusBeforeException}</span>
                  )}
                  <span>الموقع: {shipment.currentBranch?.name ?? "في الطريق"}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <Tabs defaultValue="tracking" dir="rtl">
              <TabsList variant="line" className="w-full justify-start rounded-none border-b bg-transparent px-4 h-auto py-0">
                <TabsTrigger value="tracking" className="py-3">تتبع الشحنة</TabsTrigger>
                <TabsTrigger value="cartons" className="py-3">
                  الكراتين ({shipment.cartons.length})
                  {missingCartons.length > 0 && (
                    <span className="ms-1 rounded-full bg-destructive/10 px-1.5 text-xs text-destructive">{missingCartons.length}</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="documents" className="py-3">المرفقات ({shipment.documents.length})</TabsTrigger>
                <TabsTrigger value="delivery" className="py-3">التوصيل</TabsTrigger>
              </TabsList>

              <TabsContent value="tracking" className="p-4 space-y-6">
                <ol className="space-y-4">
                  {shipment.trackingEvents.map((ev) => (
                    <li key={ev.id} className="flex gap-3">
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <div>
                        <p className="text-sm font-medium">{ev.title}</p>
                        {ev.description && <p className="text-xs text-muted-foreground">{ev.description}</p>}
                        <p className="text-xs text-muted-foreground">{formatBusinessStamp(ev.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                  {shipment.trackingEvents.length === 0 && <p className="text-sm text-muted-foreground">لا توجد أحداث بعد</p>}
                </ol>

                {/* Customs/border status is just another tracking milestone, not a separate module —
                    every status change here writes a TrackingEvent, so it shows in the list above too. */}
                <div className="border-t pt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">الحالة الجمركية</p>
                  <CustomsPanel shipmentId={shipment.id} customsCase={shipment.customsCase} />
                </div>
              </TabsContent>

              <TabsContent value="cartons" className="p-4 space-y-3">
                {/* Read straight off the cartons, not off arrivedCartons: the count and the identities
                    are now the same fact, and showing which carton is missing is the whole point of
                    recording it by identity in the first place. */}
                <div data-testid="carton-summary" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-semibold">{shipment.cartons.length} كراتين</span>
                  <span className="text-success">{arrivedCartons.length} وصلت</span>
                  {missingCartons.length > 0 && <span className="font-semibold text-destructive">{missingCartons.length} مفقود</span>}
                </div>
                {missingCartons.length > 0 && (
                  <p data-testid="missing-cartons" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    المفقود: <span dir="ltr">{missingCartons.map((c) => c.cartonCode).join("، ")}</span>
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {shipment.cartons.map((c) => (
                    <div key={c.id} className="rounded-lg border p-3 text-center">
                      <p className="text-sm font-medium">{c.cartonIndex} / {shipment.totalCartons}</p>
                      <p className="text-xs text-muted-foreground mt-1" dir="ltr">{c.cartonCode}</p>
                      <CartonStatusBadge status={c.status} />
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="documents" className="p-4">
                <DocumentsPanel companyId={user.companyId!} shipmentId={shipment.id} documents={shipment.documents} />
              </TabsContent>

              <TabsContent value="delivery" className="p-4">
                <DeliveryPanel shipment={shipment} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">معلومات الشحنة</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="العميل" value={shipment.customer.name} />
              <InfoRow label="جوال العميل" value={shipment.customer.phone} dir="ltr" icon={<Phone className="h-3.5 w-3.5" />} />
              <InfoRow label="المستلم" value={shipment.receiverName} />
              <InfoRow label="جوال المستلم" value={shipment.receiverPhone} dir="ltr" />
              <Separator />
              <InfoRow label="عدد الكراتين" value={String(shipment.totalCartons)} />
              <InfoRow label="الكراتين الواصلة" value={String(shipment.arrivedCartons)} />
              <InfoRow label="نوع البضاعة" value={shipment.goodsType ?? "—"} />
              <InfoRow label="الوزن" value={shipment.weightKg ? `${shipment.weightKg} كجم` : "—"} />
              <Separator />
              {/* toLocaleString, like every other money figure in the app — a bare template literal
                  printed "12500 ر.ي" next to the billing page's "12,500 ر.ي". */}
              <InfoRow label="أجرة الشحن" value={shipment.shippingPrice != null ? `${shipment.shippingPrice.toLocaleString("en-US")} ر.ي` : "—"} />
              <InfoRow label="المبلغ المدفوع" value={`${shipment.amountPaid.toLocaleString("en-US")} ر.ي`} />
              <InfoRow
                label="المتبقي"
                value={
                  shipment.shippingPrice != null
                    ? `${Math.max(0, shipment.shippingPrice - shipment.amountPaid).toLocaleString("en-US")} ر.ي`
                    : "—"
                }
              />
              {/* The dispute record. Shown only once a handover actually happened — an empty
                  "delivered to: —" block on every in-transit shipment would be noise. */}
              {shipment.deliveredAt && (
                <>
                  <Separator />
                  <p className="text-xs font-semibold text-success">إثبات التسليم</p>
                  <InfoRow label="استلمها" value={shipment.deliveredToName ?? "—"} />
                  <InfoRow label="تحقق آخر 4 أرقام" value={shipment.deliveredToLast4 ?? "—"} dir="ltr" />
                  <InfoRow
                    label="طريقة التسليم"
                    value={DELIVERY_CHANNEL_LABELS[shipment.deliveryChannel as DeliveryChannel] ?? shipment.deliveryChannel ?? "—"}
                  />
                  <InfoRow
                    label="وقت التسليم"
                    value={formatBusinessDateTime(shipment.deliveredAt, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  />
                  {/* Derived from the cartons, not stored: a shipment handed over short is exactly a
                      delivered shipment that still has MISSING cartons, so there is nothing extra to
                      record and nothing that can drift out of step with the carton table. */}
                  {missingCartons.length > 0 && (
                    <InfoRow
                      label="نقص عند التسليم"
                      value={`${missingCartons.length} كرتون — ${missingCartons.map((c) => c.cartonCode).join("، ")}`}
                    />
                  )}
                  {/* Without this, a shipment whose missing carton later arrived would read as a
                      clean handover: the shortage line is derived from *current* MISSING cartons, so
                      it disappears the moment the box turns up. This keeps the fact visible. */}
                  {lateArrivals.map((event) => (
                    <InfoRow
                      key={event.id}
                      label="وصل بعد التسليم"
                      value={`${event.description?.replace("وصل بعد تسليم الشحنة: ", "") ?? ""} — ${formatBusinessDateTime(event.createdAt, { day: "numeric", month: "long" })}`}
                    />
                  ))}
                  {shipment.deliveryNote && <InfoRow label="ملاحظة التسليم" value={shipment.deliveryNote} />}
                </>
              )}
              <Separator />
              <InfoRow label="الموقع الحالي" value={shipment.currentBranch?.name ?? "في الطريق"} />
              <InfoRow
                label="تاريخ الإنشاء"
                value={formatBusinessDateTime(shipment.createdAt, { year: "numeric", month: "long", day: "numeric" })}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, dir, icon }: { label: string; value: string; dir?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium flex items-center gap-1" dir={dir}>{icon}{value}</span>
    </div>
  );
}
