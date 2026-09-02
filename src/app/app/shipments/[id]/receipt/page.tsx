import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getShipmentDetail } from "@/modules/shipments/service";
import { getBranchScope } from "@/lib/branch-scope";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, FileText, CheckCircle, Calendar, Clock, MapPin, User, Package, Scale, Phone, Info, Headset, CheckCircle2, Truck, ShieldCheck, Heart, PackageCheck } from "lucide-react";
import QRCode from "qrcode";
import { PrintButton } from "@/components/labels/print-button";
import { formatDate } from "@/lib/timezone";
import { formatPhoneDisplay } from "@/lib/phone";
import { trackingUrlFor } from "@/lib/tracking";
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from "@/lib/enums";

export default async function ShipmentReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "shipments", "view");
  const { id } = await params;
  const shipment = await getShipmentDetail(user.companyId!, id, getBranchScope(user));
  if (!shipment) notFound();

  const trackingUrl = trackingUrlFor(shipment.trackingToken);
  const qrSvg = await QRCode.toString(trackingUrl, { type: "svg", margin: 0, width: 140, color: { dark: '#000000', light: '#ffffff' } });

  const printStyle = `
    @media print {
      @page { margin: 0; size: A4 portrait; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;

  return (
    <div className="p-4 print:p-0 min-h-screen bg-gray-50 print:bg-white flex flex-col items-center">
      <style>{printStyle}</style>

      {/* Print Controls */}
      <div className="print:hidden mb-4 flex w-full max-w-[210mm] items-center justify-between gap-2">
        <Link href={`/app/shipments/${shipment.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-4 w-4" /> رجوع إلى الشحنة
        </Link>
        <PrintButton>طباعة الإيصال</PrintButton>
      </div>

      {/* A4 Canvas */}
      <div 
        dir="rtl" 
        className="relative w-full max-w-[210mm] min-h-[297mm] bg-white overflow-hidden shadow-sm ring-1 ring-gray-200 print:shadow-none print:ring-0 flex flex-col text-sm"
      >
        {/* Header (Logo & Company) */}
        <div className="flex justify-between items-start px-8 pt-8 pb-6 border-b border-gray-200">
          <div className="text-right">
            <h1 className="text-xl font-bold text-gray-900">{user.company!.name}</h1>
            <p className="text-gray-500 text-xs mt-1">كل الشحنات في مكان واحد</p>
            {user.company!.phone && (
              <div className="flex items-center justify-end gap-1.5 mt-2 text-gray-700 font-semibold" dir="ltr">
                <span>{formatPhoneDisplay(user.company!.phone)}</span>
                <Phone className="h-3.5 w-3.5 text-blue-500" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div>
              <div className="text-[28px] font-black leading-none text-blue-600 tracking-wider text-left">CHARGEE</div>
              <div className="text-[9.5px] font-semibold text-gray-500 mt-1 text-left">نظام متكامل لإدارة الشحن والتوصيل</div>
            </div>
            <div className="flex items-center justify-center text-blue-600">
               <Package className="h-9 w-9 stroke-[1.5]" />
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="px-8 py-6 flex-1 flex flex-col gap-6">
          
          {/* Hero Section */}
          <div className="flex items-stretch gap-6">
            {/* Title & Top Info (Right side in RTL) */}
            <div className="flex-1 flex flex-col justify-between py-1">
              <div className="flex justify-between items-start">
                <div className="text-right flex flex-col items-start">
                  <p className="text-gray-400 text-xs font-semibold mb-1">رقم الشحنة</p>
                  <p className="text-3xl font-black text-blue-700 tabular-nums tracking-tight leading-none" dir="ltr">{shipment.shipmentNumber}</p>
                  <div className="mt-3 flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-bold border border-green-200">
                    <CheckCircle className="h-3.5 w-3.5" /> {SHIPMENT_STATUS_LABELS[shipment.status as ShipmentStatus] ?? shipment.status}
                  </div>
                </div>
                <div className="text-left flex flex-col items-end">
                  <h2 className="flex items-center gap-2 text-2xl font-black text-gray-900 flex-row-reverse">
                    إيصال استلام شحنة <FileText className="h-6 w-6 text-blue-600" /> 
                  </h2>
                  <p className="text-gray-500 text-[13px] mt-2 font-medium text-left">تم استلام الشحنة بنجاح في فرعنا وحالتها قيد النقل</p>
                </div>
              </div>

              {/* 3 Columns Sub-info */}
              <div className="mt-auto grid grid-cols-3 border border-gray-200 rounded-xl divide-x divide-gray-200 divide-x-reverse">
                <div className="p-3 flex items-center justify-between">
                  <div className="text-right">
                    <p className="text-[11px] text-gray-400 font-semibold mb-0.5">تاريخ الاستلام</p>
                    <p className="font-bold text-gray-800">{formatDate(shipment.createdAt)}</p>
                  </div>
                  <Calendar className="h-5 w-5 text-blue-500" />
                </div>
                <div className="p-3 flex items-center justify-between">
                  <div className="text-right">
                    <p className="text-[11px] text-gray-400 font-semibold mb-0.5">وقت الاستلام</p>
                    <p className="font-bold text-gray-800" dir="ltr">{(new Date(shipment.createdAt)).toLocaleTimeString("ar-SA", { hour: '2-digit', minute:'2-digit' })}</p>
                  </div>
                  <Clock className="h-5 w-5 text-blue-500" />
                </div>
                <div className="p-3 flex items-center justify-between">
                  <div className="text-right">
                    <p className="text-[11px] text-gray-400 font-semibold mb-0.5">فرع الاستلام</p>
                    <p className="font-bold text-gray-800">{shipment.loadBranch.name}</p>
                  </div>
                  <MapPin className="h-5 w-5 text-blue-500" />
                </div>
              </div>
            </div>

            {/* QR Code (Left side in RTL) */}
            <div className="w-[160px] shrink-0 border border-gray-200 rounded-xl p-3 flex flex-col items-center justify-center gap-2">
              <div className="h-[120px] w-[120px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <div className="flex items-center gap-1.5 text-blue-600 text-[11px] font-bold">
                امسح لتتبع الشحنة <FileText className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>

          {/* Parties Section */}
          <div className="grid grid-cols-2 gap-6 mt-2">
            <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col">
              <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center justify-between">
                <span className="font-bold text-blue-900 flex items-center gap-2">
                  <User className="h-4 w-4 text-blue-600" /> بيانات المرسل
                </span>
              </div>
              <div className="p-4 flex-1 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 font-semibold">الاسم</span>
                  <span className="font-black text-gray-900 text-[15px]">{shipment.customer.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 font-semibold">رقم الجوال</span>
                  <span className="font-bold text-gray-800" dir="ltr">{shipment.customer.phone ? formatPhoneDisplay(shipment.customer.phone) : "—"}</span>
                </div>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden flex flex-col">
              <div className="bg-green-50 px-4 py-3 border-b border-green-100 flex items-center justify-between">
                <span className="font-bold text-green-900 flex items-center gap-2">
                  <User className="h-4 w-4 text-green-600" /> بيانات المستلم
                </span>
              </div>
              <div className="p-4 flex-1 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 font-semibold">الاسم</span>
                  <span className="font-black text-gray-900 text-[15px]">{shipment.receiverName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500 font-semibold">رقم الجوال</span>
                  <span className="font-bold text-gray-800" dir="ltr">{shipment.receiverPhone ? formatPhoneDisplay(shipment.receiverPhone) : "—"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Details Section */}
          <div className="border border-gray-200 rounded-xl overflow-hidden mt-2">
             <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-white">
                <span className="font-bold text-gray-900 flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" /> تفاصيل الشحنة
                </span>
              </div>
              <div className="grid grid-cols-4 divide-x divide-gray-200 divide-x-reverse bg-white">
                <div className="p-4 flex flex-col items-center text-center gap-1.5">
                  <span className="text-[11px] text-gray-500 font-semibold">عدد الكراتين</span>
                  <div className="flex items-center gap-2 font-black text-gray-900 text-lg">
                    {shipment.totalCartons} <Package className="h-5 w-5 text-blue-500" />
                  </div>
                </div>
                <div className="p-4 flex flex-col items-center text-center gap-1.5">
                  <span className="text-[11px] text-gray-500 font-semibold">نوع البضاعة</span>
                  <div className="flex items-center gap-2 font-black text-gray-900 text-[15px]">
                    {shipment.goodsType || "—"} <PackageCheck className="h-5 w-5 text-blue-500" />
                  </div>
                </div>
                <div className="p-4 flex flex-col items-center text-center gap-1.5">
                  <span className="text-[11px] text-gray-500 font-semibold">الوزن</span>
                  <div className="flex items-center gap-2 font-black text-gray-900 text-[15px]">
                    {shipment.weightKg != null ? `${shipment.weightKg} كجم` : "—"} <Scale className="h-5 w-5 text-blue-500" />
                  </div>
                </div>
                <div className="p-4 flex flex-col items-center text-center gap-1.5">
                  <span className="text-[11px] text-gray-500 font-semibold">فرع التسليم</span>
                  <div className="flex items-center gap-2 font-black text-gray-900 text-[15px]">
                    {shipment.unloadBranch.name} <MapPin className="h-5 w-5 text-blue-500" />
                  </div>
                </div>
              </div>
          </div>

          {/* Alert Box */}
          <div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-4 items-center text-blue-900">
            <Info className="h-5 w-5 text-blue-600 shrink-0" />
            <div className="space-y-1 text-right w-full">
              <p className="font-bold text-[13px] text-blue-700">ملاحظة</p>
              <p className="text-xs text-blue-800 leading-relaxed font-medium">
                إيصال تشغيلي لإثبات استلام الشحنة وتفاصيلها فقط — وليس مستنداً مالياً أو ضريبياً ولا مستنداً جمركياً حصرياً.
                تتبّع حالة الشحنة عبر مسح رمز الاستجابة السريعة أعلاه أو من خلال رقم الشحنة.
              </p>
            </div>
          </div>

          {/* Signatures & Stamp */}
          <div className="mt-auto relative grid grid-cols-2 gap-8 pt-10 pb-8 break-inside-avoid">
            {/* The Stamp (Absolute Center) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center opacity-90 text-blue-600 pointer-events-none">
              <svg viewBox="0 0 200 200" className="w-[140px] h-[140px]">
                <path id="textPathTop" d="M 40, 100 a 60,60 0 1,1 120,0" fill="transparent" />
                <path id="textPathBot" d="M 160, 100 a 60,60 0 1,1 -120,0" fill="transparent" />
                <text className="text-[16px] font-black uppercase tracking-widest fill-current">
                  <textPath href="#textPathTop" startOffset="50%" textAnchor="middle">
                    • {user.company!.name} •
                  </textPath>
                </text>
                <text className="text-[14px] font-bold uppercase tracking-widest fill-current">
                  <textPath href="#textPathBot" startOffset="50%" textAnchor="middle">
                    • {shipment.loadBranch.name} •
                  </textPath>
                </text>
                <circle cx="100" cy="100" r="45" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                <circle cx="100" cy="100" r="75" fill="none" stroke="currentColor" strokeWidth="2" />
                <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center -space-y-1 pt-1">
                <CheckCircle2 className="h-7 w-7" />
                <span className="text-[11px] font-bold mt-1">تم الاستلام</span>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl p-5 text-sm relative z-0">
              <p className="font-bold mb-6 flex items-center gap-2 text-gray-900"><User className="h-4 w-4 text-gray-500" /> توقيع المرسِل</p>
              <div className="space-y-4 text-gray-500 font-medium">
                <div className="flex items-end gap-3"><span className="w-16">الاسم:</span> <div className="flex-1 border-b border-gray-300 border-dashed pb-1 text-gray-900 font-bold">{shipment.customer.name}</div></div>
                <div className="flex items-end gap-3"><span className="w-16">التوقيع:</span> <div className="flex-1 border-b border-gray-300 border-dashed pb-1">&nbsp;</div></div>
                <div className="flex items-end gap-3"><span className="w-16">التاريخ:</span> <div className="flex-1 border-b border-gray-300 border-dashed pb-1">&nbsp;</div></div>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl p-5 text-sm relative z-0">
              <p className="font-bold mb-6 flex items-center gap-2 text-gray-900"><User className="h-4 w-4 text-gray-500" /> موظف الاستلام</p>
              <div className="space-y-4 text-gray-500 font-medium">
                <div className="flex items-end gap-3"><span className="w-16">الاسم:</span> <div className="flex-1 border-b border-gray-300 border-dashed pb-1">&nbsp;</div></div>
                <div className="flex items-end gap-3"><span className="w-16">التوقيع:</span> <div className="flex-1 border-b border-gray-300 border-dashed pb-1">&nbsp;</div></div>
                <div className="flex items-end gap-3"><span className="w-16">التاريخ:</span> <div className="flex-1 border-b border-gray-300 border-dashed pb-1">&nbsp;</div></div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="mt-auto">
          <div className="bg-gray-50 px-8 py-5 border-t border-gray-200 flex justify-between items-center">
            <div className="flex items-center gap-2 text-gray-700 font-bold text-xs">
              <Truck className="h-5 w-5 text-blue-600" /> شحن آمن وسريع
            </div>
            <div className="flex items-center gap-2 text-gray-700 font-bold text-xs">
              <ShieldCheck className="h-5 w-5 text-blue-600" /> تتبع شحنتك بسهولة
            </div>
            <div className="flex items-center gap-2 text-gray-700 font-bold text-xs">
              <Headset className="h-5 w-5 text-blue-600" /> خدمة عملاء 24/7
            </div>
          </div>
          <div className="bg-blue-600 text-white px-8 py-4 flex justify-between items-center text-xs font-semibold">
            <span>info@chargee.com</span>
            <span className="flex items-center gap-1.5">شكراً لاختيارك شارجي <Heart className="h-3.5 w-3.5 fill-white text-white" /></span>
            <span dir="ltr">www.chargee.com</span>
          </div>
        </div>

      </div>
    </div>
  );
}
