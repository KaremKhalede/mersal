"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Printer, ClipboardList, SlidersHorizontal, Eye, EyeOff, ChevronRight, ChevronLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { CartonPrintCard } from "@/components/labels/carton-print-card";
import { cn } from "@/lib/utils";

/**
 * Each row carries its own shipment context rather than inheriting it from the panel: the trip-level
 * bulk page prints cartons from many different shipments in one grid, so shipment number, route and
 * receiver vary per card. Keeping them on the row is what lets the single-shipment page and the trip
 * page share this component instead of maintaining two label layouts that drift apart.
 */
export type CartonRow = {
  id: string;
  shipmentNumber: string;
  cartonIndex: number;
  totalCartons: number;
  loadBranchName: string;
  unloadBranchName: string;
  receiverName: string;
  receiverPhone: string;
  cartonCode: string;
  qrSvg: string;
};

const PAGE_SIZE_OPTIONS = [10, 25, 50];

/**
 * Pagination here is on-screen-only local state, not the app's usual URL-driven Pagination
 * component — printing must always include every carton regardless of which page is showing, and
 * a full reload on every page click would also wipe the print-options/preview toggles below. Cards
 * outside the current page get `display: none` inline (see CartonPrintCard), which a `!important`
 * print rule in globals.css overrides — so print output never depends on-screen pagination state.
 */
export function CartonPrintPanel({
  companyName,
  cartons,
  heading = "طباعة أكواد الكراتين",
  emptyMessage = "لا توجد كراتين مسجّلة لهذه الشحنة",
}: {
  companyName: string;
  cartons: CartonRow[];
  heading?: string;
  emptyMessage?: string;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [columns, setColumns] = useState<2 | 3>(3);
  // Off by default. The strip is explicitly decorative — DecorativeBarcode's own docstring says it
  // "never claims to be scannable", there is no symbology and no checksum — yet it shipped on every
  // label, taking roughly a quarter of a 100x150mm card and inviting a warehouse worker to point a
  // scanner at something that cannot answer. The QR beside it carries the real carton code. Still
  // one click away in خيارات الطباعة for anyone who wants the visual weight.
  const [showBarcode, setShowBarcode] = useState(false);
  const [showQR, setShowQR] = useState(true);
  const [preview, setPreview] = useState(false);

  const pageCount = Math.max(1, Math.ceil(cartons.length / pageSize));
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  const copy = useMemo(
    () => (code: string) => {
      navigator.clipboard.writeText(code);
      toast.success("تم نسخ كود الكرتون");
    },
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Printer className="h-5 w-5 text-primary" /> {heading}
        </h2>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><SlidersHorizontal className="h-4 w-4" /> خيارات الطباعة</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>الأعمدة في الصفحة</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={String(columns)} onValueChange={(v) => setColumns(Number(v) === 2 ? 2 : 3)}>
                <DropdownMenuRadioItem value="2">عمودان</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="3">ثلاثة أعمدة</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={showQR} onCheckedChange={setShowQR}>إظهار رمز QR</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showBarcode} onCheckedChange={setShowBarcode}>إظهار الباركود</DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={preview}
            onClick={() => setPreview((v) => !v)}
            className={cn(preview && "bg-muted text-foreground")}
          >
            {preview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} معاينة قبل الطباعة
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> طباعة جميع الأكواد
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-sm font-medium text-primary print:hidden">
        <ClipboardList className="h-4 w-4 shrink-0" /> إجمالي الكراتين: {cartons.length} كرتون
      </div>

      {cartons.length === 0 ? (
        <p className="rounded-lg border py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <>
        {/*
          Thermal-label page geometry (4×6 inch / 100×150mm), scoped to the only screens that print
          labels by shipping with the label UI instead of living in globals.css.

          `@page` is a document-level rule — no selector, no class, no container can scope it — so
          declaring this globally silently forced the manifest, the invoice and the shipments list
          onto a 100×150mm page too. A <style> element in the body is still document-wide CSS, but
          it only exists on a page that actually renders this component, and it cascades after the
          stylesheet in <head>, so it overrides the A4 default exactly where it should.
        */}
        <style>{`@media print { @page { size: 100mm 150mm; margin: 0; } }`}</style>
        <div
          dir="rtl"
          className={cn(
            "labels-grid grid gap-4",
            columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
          )}
        >
          {cartons.map((carton, i) => (
            <CartonPrintCard
              key={carton.id}
              companyName={companyName}
              shipmentNumber={carton.shipmentNumber}
              cartonIndex={carton.cartonIndex}
              totalCartons={carton.totalCartons}
              loadBranchName={carton.loadBranchName}
              unloadBranchName={carton.unloadBranchName}
              receiverName={carton.receiverName}
              receiverPhone={carton.receiverPhone}
              cartonCode={carton.cartonCode}
              qrSvg={carton.qrSvg}
              showBarcode={showBarcode}
              showQR={showQR}
              onCopy={() => copy(carton.cartonCode)}
              hidden={!preview && (i < start || i >= end)}
            />
          ))}
        </div>
        </>
      )}

      <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground print:hidden">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        تأكد من لصق الكود على الكرتون بشكل واضح قبل التحميل لضمان تتبع الشحنة بدقة.
      </div>

      {!preview && cartons.length > 0 && pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <p className="text-xs text-muted-foreground">
            عرض {start + 1} - {Math.min(end, cartons.length)} من {cartons.length} كرتون
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="الصفحة السابقة">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="px-1 text-sm">{page} / {pageCount}</span>
            <Button variant="outline" size="icon-sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="الصفحة التالية">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            عدد الصفوف
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="h-7 rounded-md border border-input bg-transparent px-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
