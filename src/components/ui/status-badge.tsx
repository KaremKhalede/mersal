import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus, STOP_TIMING_LABELS, type StopTiming, CARTON_STATUS_LABELS, type CartonStatus } from "@/lib/enums";
import { CheckCircle2, Circle, PackageCheck, AlertCircle, Ban, type LucideIcon } from "lucide-react";

const TONE: Record<ShipmentStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  REGISTERED: "bg-secondary text-secondary-foreground",
  RECEIVED: "bg-secondary text-secondary-foreground",
  READY_FOR_LOADING: "bg-warning/15 text-warning border-warning/30",
  LOADED: "bg-primary/10 text-primary border-primary/30",
  IN_TRANSIT: "bg-primary/10 text-primary border-primary/30",
  AT_INTERMEDIATE_STOP: "bg-primary/10 text-primary border-primary/30",
  PARTIALLY_ARRIVED: "bg-warning/15 text-warning border-warning/30",
  ARRIVED: "bg-success/15 text-success border-success/30",
  READY_FOR_PICKUP: "bg-success/15 text-success border-success/30",
  DELIVERY_REQUESTED: "bg-primary/10 text-primary border-primary/30",
  OUT_FOR_DELIVERY: "bg-primary/10 text-primary border-primary/30",
  DELIVERED: "bg-success/15 text-success border-success/30",
  CANCELLED: "bg-muted text-muted-foreground",
  EXCEPTION: "bg-destructive/10 text-destructive border-destructive/30",
};

// Only where an icon adds real recognition value (done / needs-attention / cancelled) — every
// other status is text-only, per the "remove decorative icons" rule (see AGENTS.md phase brief).
const ICON: Partial<Record<ShipmentStatus, LucideIcon>> = {
  READY_FOR_PICKUP: PackageCheck,
  DELIVERED: CheckCircle2,
  PARTIALLY_ARRIVED: Circle,
  EXCEPTION: AlertCircle,
  CANCELLED: Ban,
};

export function ShipmentStatusBadge({ status }: { status: string }) {
  const s = status as ShipmentStatus;
  const Icon = ICON[s];
  return (
    <Badge variant="outline" className={cn("border", TONE[s] ?? "bg-muted")}>
      {Icon && <Icon className="h-3 w-3" />}
      {SHIPMENT_STATUS_LABELS[s] ?? status}
    </Badge>
  );
}

const CARTON_TONE: Record<CartonStatus, string> = {
  REGISTERED: "bg-secondary text-secondary-foreground",
  LOADED: "bg-primary/10 text-primary border-primary/30",
  IN_TRANSIT: "bg-primary/10 text-primary border-primary/30",
  UNLOADED: "bg-secondary text-secondary-foreground",
  ARRIVED: "bg-success/15 text-success border-success/30",
  DELIVERED: "bg-success/15 text-success border-success/30",
  MISSING: "bg-destructive/10 text-destructive border-destructive/30",
  DAMAGED: "bg-destructive/10 text-destructive border-destructive/30",
};

/** A carton is not a shipment: it has states (MISSING, DAMAGED, UNLOADED) the shipment badge has no
 *  word for, and it rendered them as raw enum keys at an Arabic-first user. */
export function CartonStatusBadge({ status }: { status: string }) {
  const s = status as CartonStatus;
  return (
    <Badge variant="outline" className={cn("border", CARTON_TONE[s] ?? "bg-muted")}>
      {CARTON_STATUS_LABELS[s] ?? status}
    </Badge>
  );
}

// Same success/warning/destructive tone tokens as everywhere else — a color means one thing
// consistently across the app (StatCard, ShipmentStatusBadge, and this).
const STOP_TIMING_TONE_CLASSES: Record<StopTiming, string> = {
  ON_TIME: "bg-success/15 text-success border-success/30",
  AT_RISK: "bg-warning/15 text-warning border-warning/30",
  LATE: "bg-destructive/10 text-destructive border-destructive/30",
};

export function StopTimingBadge({ timing }: { timing: StopTiming }) {
  return <Badge variant="outline" className={cn("border", STOP_TIMING_TONE_CLASSES[timing])}>{STOP_TIMING_LABELS[timing]}</Badge>;
}

const INVOICE_STATUS_LABELS: Record<string, string> = { PAID: "مسددة", UNPAID: "غير مسددة", CANCELLED: "ملغاة" };
const INVOICE_STATUS_TONE: Record<string, string> = {
  PAID: "bg-success/15 text-success border-success/30",
  UNPAID: "bg-warning/15 text-warning border-warning/30",
  CANCELLED: "bg-muted text-muted-foreground",
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("border", INVOICE_STATUS_TONE[status] ?? "bg-muted")}>
      {INVOICE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

/** Active/disabled toggle status — same success-vs-muted convention duplicated across employees,
 * vehicles, branches, roles, and platform users tables. One place so "active" means the same
 * green everywhere instead of each table re-typing the class string. */
export function ActiveBadge({ active, activeLabel = "نشط", inactiveLabel = "غير نشط" }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  return (
    <Badge variant="outline" className={active ? "border-success/30 bg-success/15 text-success" : "bg-muted"}>
      {active ? activeLabel : inactiveLabel}
    </Badge>
  );
}
