import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getShipmentDetail } from "@/modules/shipments/service";
import { getBranchScope } from "@/lib/branch-scope";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShipmentStatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Phone } from "lucide-react";
import { ShipmentActions } from "./shipment-actions";
import { ResolveExceptionButton } from "./resolve-exception-button";
import { DocumentsPanel } from "@/app/app/documents/documents-panel";
import { CustomsPanel } from "@/app/app/customs/customs-panel";
import { DeliveryPanel } from "@/app/app/delivery/delivery-panel";
import { EXCEPTION_TYPE_LABELS, type ExceptionType } from "@/lib/enums";

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "shipments", "view");
  const { id } = await params;
  const shipment = await getShipmentDetail(user.companyId!, id, getBranchScope(user));
  if (!shipment) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{shipment.shipmentNumber}</h2>
            <ShipmentStatusBadge status={shipment.status} />
          </div>
          <p className="text-muted-foreground mt-1">{shipment.loadBranch.name} ← {shipment.unloadBranch.name}</p>
        </div>
        {shipment.status === "EXCEPTION" ? (
          <ResolveExceptionButton shipmentId={shipment.id} statusBeforeException={shipment.statusBeforeException} />
        ) : (
          <ShipmentActions shipment={shipment} />
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <Tabs defaultValue="tracking" dir="rtl">
              <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-4 h-auto py-0">
                <TabsTrigger value="tracking" className="py-3">تتبع الشحنة</TabsTrigger>
                <TabsTrigger value="cartons" className="py-3">الكراتين ({shipment.cartons.length})</TabsTrigger>
                <TabsTrigger value="customs" className="py-3">الجمارك</TabsTrigger>
                <TabsTrigger value="documents" className="py-3">المرفقات ({shipment.documents.length})</TabsTrigger>
                <TabsTrigger value="delivery" className="py-3">التوصيل</TabsTrigger>
              </TabsList>

              <TabsContent value="tracking" className="p-4">
                <ol className="space-y-4">
                  {shipment.trackingEvents.map((ev) => (
                    <li key={ev.id} className="flex gap-3">
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <div>
                        <p className="text-sm font-medium">{ev.title}</p>
                        {ev.description && <p className="text-xs text-muted-foreground">{ev.description}</p>}
                        <p className="text-xs text-muted-foreground">{new Date(ev.createdAt).toLocaleString("ar-SA")}</p>
                      </div>
                    </li>
                  ))}
                  {shipment.trackingEvents.length === 0 && <p className="text-sm text-muted-foreground">لا توجد أحداث بعد</p>}
                </ol>
              </TabsContent>

              <TabsContent value="cartons" className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {shipment.cartons.map((c) => (
                    <div key={c.id} className="rounded-lg border p-3 text-center">
                      <p className="text-sm font-medium">{c.cartonIndex} / {shipment.totalCartons}</p>
                      <p className="text-xs text-muted-foreground mt-1" dir="ltr">{c.cartonCode}</p>
                      <ShipmentStatusBadge status={c.status} />
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="customs" className="p-4">
                <CustomsPanel companyId={user.companyId!} shipmentId={shipment.id} customsCase={shipment.customsCase} />
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
              <InfoRow label="أجرة الشحن" value={shipment.shippingPrice != null ? `${shipment.shippingPrice} ر.ي` : "—"} />
              <InfoRow label="المبلغ المدفوع" value={`${shipment.amountPaid} ر.ي`} />
              <InfoRow
                label="المتبقي"
                value={shipment.shippingPrice != null ? `${Math.max(0, shipment.shippingPrice - shipment.amountPaid)} ر.ي` : "—"}
              />
              {shipment.status === "EXCEPTION" && (
                <>
                  <Separator />
                  <InfoRow label="نوع الاستثناء" value={EXCEPTION_TYPE_LABELS[shipment.exceptionType as ExceptionType] ?? "—"} />
                  {shipment.exceptionNote && <InfoRow label="ملاحظة" value={shipment.exceptionNote} />}
                </>
              )}
              <Separator />
              <InfoRow label="الموقع الحالي" value={shipment.currentBranch?.name ?? "في الطريق"} />
              <InfoRow label="تاريخ الإنشاء" value={new Date(shipment.createdAt).toLocaleDateString("ar-SA")} />
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
