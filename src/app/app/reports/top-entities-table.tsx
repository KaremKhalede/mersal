import Link from "next/link";
import { ChevronLeft } from "lucide-react";

type Row = { branch: { id: string; name: string }; shipments: number; cartons: number; pct: number };

const BAR_TONE: Record<string, string> = { success: "bg-success", primary: "bg-primary" };

/** Shared shape for "أكثر الفروع نشاطاً" and "أكثر الوجهات نشاطاً" — same table, different accent
 * color and href, so the two panels can never visually drift apart. */
export function TopEntitiesTable({
  title,
  rows,
  tone,
  moreHref,
  moreLabel,
}: {
  title: string;
  rows: Row[];
  tone: "success" | "primary";
  moreHref: string;
  moreLabel: string;
}) {
  const top = rows.slice(0, 5);

  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b p-4">
        <h3 className="font-heading text-base font-medium">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="w-10 px-4 py-2 text-start font-medium">الترتيب</th>
              <th className="px-2 py-2 text-start font-medium">الفرع</th>
              <th className="px-2 py-2 text-start font-medium">عدد الشحنات</th>
              <th className="px-2 py-2 text-start font-medium">عدد الكراتين</th>
              <th className="px-4 py-2 text-start font-medium">النسبة من الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r, i) => (
              <tr key={r.branch.id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-2.5 font-medium">{r.branch.name}</td>
                <td className="px-2 py-2.5">{r.shipments.toLocaleString()}</td>
                <td className="px-2 py-2.5">{r.cartons.toLocaleString()}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${BAR_TONE[tone]}`} style={{ width: `${Math.min(100, r.pct)}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{r.pct}%</span>
                  </div>
                </td>
              </tr>
            ))}
            {top.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">لا توجد بيانات لهذه الفترة</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && (
        <Link href={moreHref} className="flex items-center justify-center gap-1 border-t px-4 py-2.5 text-xs font-medium text-primary hover:bg-accent">
          {moreLabel} <ChevronLeft className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
