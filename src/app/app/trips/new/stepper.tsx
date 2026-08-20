import { cn } from "@/lib/utils";
import { Route, PackageSearch, ClipboardList, Truck, type LucideIcon } from "lucide-react";

const STEPS: { icon: LucideIcon; title: string; description: string }[] = [
  { icon: Route, title: "إنشاء الرحلة", description: "إنشاء رحلة وتحديد المسار والمركبة والسائق وتاريخ الانطلاق" },
  { icon: PackageSearch, title: "اختيار الشحنات", description: "اختيار الشحنات المناسبة لهذه الرحلة يتم الاقتراح تلقائياً" },
  { icon: ClipboardList, title: "مراجعة الرحلة", description: "مراجعة الشحنات والكراتين، إصدار قائمة الحمولة" },
  { icon: Truck, title: "بدء الرحلة", description: "تسليم الرحلة للسائق وبدء التحميل، تتغير حالات الشحنات تلقائياً" },
];

/**
 * Progress indicator for trip creation — not a page-by-page wizard. Steps 1–2 are this page (the
 * form and the shipment-suggestion panel live side by side, both editable at once); steps 3–4 are
 * simply what the trip detail page already does once this one redirects there (review the manifest,
 * confirm loading). Shown left-to-right in reading order 4→1 for RTL, current step highlighted.
 */
export function TripWizardStepper({ current }: { current: 1 | 2 }) {
  return (
    <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
      {STEPS.slice().reverse().map((step, i) => {
        const stepNumber = STEPS.length - i;
        const isCurrent = stepNumber === current;
        const isDone = stepNumber < current;
        const Icon = step.icon;
        return (
          <div key={step.title} className="flex items-center gap-3">
            <div
              className={cn(
                "flex min-w-48 flex-col gap-1 rounded-xl border p-3",
                isCurrent ? "border-primary bg-primary/5" : "bg-card"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    isCurrent ? "bg-primary text-primary-foreground" : isDone ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                  )}
                >
                  {stepNumber}
                </span>
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {step.title}
                </span>
              </div>
              <p className="text-[0.7rem] text-muted-foreground leading-snug">{step.description}</p>
            </div>
            {i < STEPS.length - 1 && <div className="h-px w-4 shrink-0 border-t border-dashed border-border" />}
          </div>
        );
      })}
    </div>
  );
}
