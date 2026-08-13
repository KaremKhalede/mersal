import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus, STOP_TIMING_LABELS, type StopTiming } from "@/lib/enums";

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

export function ShipmentStatusBadge({ status }: { status: string }) {
  const s = status as ShipmentStatus;
  return <Badge variant="outline" className={cn("border", TONE[s] ?? "bg-muted")}>{SHIPMENT_STATUS_LABELS[s] ?? status}</Badge>;
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
