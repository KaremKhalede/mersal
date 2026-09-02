import { requireCompanyUser } from "@/lib/auth";
import { requireCan, can } from "@/lib/rbac";
import { getShipmentDetail, getExceptionReporter, getExceptionRecoveryOptions } from "@/modules/shipments/service";
import { getBranchScope } from "@/lib/branch-scope";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShipmentStatusBadge, CartonStatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { Phone, AlertTriangle, User, ArrowLeft } from "lucide-react";
import { ShipmentActions } from "./shipment-actions";
import { ResolveExceptionButton } from "./resolve-exception-button";
import { DocumentsPanel } from "@/app/app/documents/documents-panel";
import { CustomsPanel } from "@/app/app/customs/customs-panel";
import { DeliveryPanel } from "@/app/app/delivery/delivery-panel";
import { formatBusinessDateTime, formatDate, formatDateStamp } from "@/lib/timezone";
import { formatPhoneDisplay } from "@/lib/phone";
import { EXCEPTION_TYPE_LABELS, SHIPMENT_STATUS_LABELS, DELIVERY_CHANNEL_LABELS, type ExceptionType, type ShipmentStatus, type DeliveryChannel } from "@/lib/enums";
import { PageHeader } from "@/components/shell/page-header";
import { toMoneyOrNull } from "@/lib/money";import { cn, routeLabel } from "@/lib/utils";

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
  const recoveryOptions = isException ? await getExceptionRecoveryOptions(shipment.id) : [];

  return (
    <div className="space-y-4">
      <PageHeader
        variant="record"
        title={shipment.shipmentNumber}
        description={routeLabel(shipment.loadBranch.name, shipment.unloadBranch.name)}
        badge={<ShipmentStatusBadge status={shipment.status} />}
        parent={{ label: "الشحنات", href: "/app/shipments" }}
        actions={
          isException ? (
            <ResolveExceptionButton shipmentId={shipment.id} options={recoveryOptions} />
          ) : (
            <ShipmentActions shipment={shipment} />
          )
        }
      />

      {/*
        The three questions this page is opened to answer, on one line, above everything else.
        They were all present before — as rows 11, 12 and 2 of a flat thirteen-row list in the
        sidebar, where "المتبقي: 33,000 ر.ي" carried exactly the same weight as "نوع البضاعة: —".
        Staff do not read this page, they scan it for these three, so they get stated once at
        a glance and once again in the record below.

        Same shape as the dashboard's "ملخص مالي" strip (grid + divide-x-reverse, label under
        value) rather than a new pattern — and deliberately not StatCard, which is a dashboard
        figure with an icon tile and is far too loud for a per-record fact.
      */}
      <Card>
        <CardContent className="grid grid-cols-2 divide-x divide-x-reverse text-center">
          <Fact label="الموقع الحالي" value={shipment.currentBranch?.name ?? "في الطريق"} />
          {/* Same numerator/denominator the list and the cartons tab use, so the three agree. */}
          <Fact label="الكراتين" value={`${shipment.arrivedCartons} / ${shipment.totalCartons}`} ltr />
        </CardContent>
      </Card>

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
                        <p className="text-xs text-muted-foreground">{formatDateStamp(ev.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                  {shipment.trackingEvents.length === 0 && <p className="text-sm text-muted-foreground">لا توجد أحداث بعد</p>}
                </ol>

                {/* Customs/border status is just another tracking milestone, not a separate module —
                    every status change here writes a TrackingEvent, so it shows in the list above too. */}
                <div className="border-t pt-4">
                  {/* CustomsPanel labels its own field "الحالة الجمركية" — a heading above it saying
                      the same words twice was two identical labels stacked. */}
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

              <TabsContent value="documents" className="p-4 space-y-3">
                <DocumentsPanel companyId={user.companyId!} shipmentId={shipment.id} documents={shipment.documents} />
                {/* The company-wide archive left the sidebar — it is an index of attachments, not a
                    destination anyone sets out for. This is where someone thinking about documents
                    already is, so it is where the way to all of them belongs. */}
                {can(user, "documents", "view") && (
                  <Link href="/app/documents" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    عرض كل مستندات الشركة <ArrowLeft className="h-3 w-3" />
                  </Link>
                )}
              </TabsContent>

              <TabsContent value="delivery" className="p-4">
                <DeliveryPanel shipment={shipment} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/*
          order-first below lg: on a phone this column used to sit under the whole tabs card — the
          timeline, then the customs panel — so the customer's phone number, the receiver and the
          balance were the last things on the page. They are what someone standing at the counter
          with the customer in front of them actually needs, so on a phone they come first and the
          timeline (the least urgent thing here) follows. On lg the two-column layout is unchanged.
        */}
        <div className="order-first space-y-4 lg:order-none">
          <Card>
            <CardHeader><CardTitle className="text-base">معلومات الشحنة</CardTitle></CardHeader>
            {/*
              Grouped, not flattened. Every row that was here is still here and in the same order —
              what changed is that the thirteen of them are now three labelled groups instead of one
              undifferentiated column broken by two anonymous rules, so the eye can jump to "المالية"
              instead of reading down to find it.
            */}
            <CardContent className="space-y-4 text-sm">
              <Section title="الأطراف">
                <InfoRow label="العميل" value={shipment.customer.name} />
                <InfoRow label="جوال العميل" value={formatPhoneDisplay(shipment.customer.phone)} dir="ltr" icon={<Phone className="h-3.5 w-3.5" />} />
                <InfoRow label="المستلم" value={shipment.receiverName} />
                <InfoRow label="جوال المستلم" value={formatPhoneDisplay(shipment.receiverPhone)} dir="ltr" />
              </Section>
              <Separator />
              <Section title="الشحنة">
                <InfoRow label="عدد الكراتين" value={String(shipment.totalCartons)} />
                <InfoRow label="الكراتين الواصلة" value={String(shipment.arrivedCartons)} />
                <InfoRow label="نوع البضاعة" value={shipment.goodsType ?? "—"} />
                <InfoRow label="الوزن" value={shipment.weightKg ? `${shipment.weightKg} كجم` : "—"} />
              </Section>

              {/* The dispute record. Shown only once a handover actually happened — an empty
                  "delivered to: —" block on every in-transit shipment would be noise. */}
              {shipment.deliveredAt && (
                <>
                  <Separator />
                  <Section title="إثبات التسليم" tone="success">
                  <InfoRow label="استلمها" value={shipment.deliveredToName ?? "—"} />
                  <InfoRow label="تحقق آخر 4 أرقام" value={shipment.deliveredToLast4 ?? "—"} dir="ltr" />
                  <InfoRow
                    label="طريقة التسليم"
                    value={DELIVERY_CHANNEL_LABELS[shipment.deliveryChannel as DeliveryChannel] ?? shipment.deliveryChannel ?? "—"}
                  />
                  <InfoRow
                    label="وقت التسليم"
                    value={formatDateStamp(shipment.deliveredAt)}
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
                  </Section>
                </>
              )}
              <Separator />
              {/* Both restated deliberately: the strip above is the glance, this is the record, and
                  the location is one of the three facts worth saying twice. */}
              <Section title="التتبع">
                <InfoRow label="الموقع الحالي" value={shipment.currentBranch?.name ?? "في الطريق"} />
                <InfoRow
                  label="تاريخ الإنشاء"
                  value={formatDate(shipment.createdAt)}
                />
              </Section>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** One cell of the facts strip. Local to this page on purpose — one use is not an abstraction, and
 *  the moment a second page wants it, that is when it earns being extracted. */
function Fact({ label, value, tone, ltr }: { label: string; value: string; tone?: "warning"; ltr?: boolean }) {
  return (
    <div className="min-w-0 px-2">
      <p className={cn("truncate text-base font-bold", tone === "warning" && "text-warning")} dir={ltr ? "ltr" : undefined}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** A titled group of InfoRows. Same small muted heading the customs section and the delivery-proof
 *  block already use, so the card reads as one thing rather than three treatments. */
function Section({ title, tone, children }: { title: string; tone?: "success"; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className={cn("text-xs font-semibold", tone === "success" ? "text-success" : "text-muted-foreground")}>{title}</p>
      {children}
    </div>
  );
}

function InfoRow({ label, value, dir, icon, tone }: { label: string; value: string; dir?: string; icon?: React.ReactNode; tone?: "warning" }) {
  return (
    // items-start + min-w-0: a long value ("3 كرتون — SH-1-01، SH-1-02، SH-1-03") used to push the
    // label out of the row instead of wrapping under itself in a ~370px column.
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("flex min-w-0 items-center gap-1 text-end font-medium", tone === "warning" && "text-warning")} dir={dir}>
        {icon}{value}
      </span>
    </div>
  );
}
