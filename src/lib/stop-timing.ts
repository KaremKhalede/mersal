import type { StopTiming } from "./enums";

/** Past this many minutes late with no arrival yet, a stop moves from "at risk" to "late". */
export const AT_RISK_MINUTES = 30;

/**
 * Deterministic on-time/at-risk/late signal for a trip stop — no GPS, no ETA prediction, just
 * plannedArrival vs. actualArrival (or "now" if it hasn't happened yet). See the Phase 5 P1
 * batch-1 report for the exact rule:
 *
 *   reference = actualArrival ?? now
 *   diff = reference - plannedArrival, in minutes
 *
 *   no plannedArrival                          -> null (insufficient data, render nothing)
 *   diff <= 0                                  -> ON_TIME
 *   diff > 0 and already arrived                -> LATE   (it happened, and it was late)
 *   diff > 0, not yet arrived, diff <= 30        -> AT_RISK
 *   diff > 30, not yet arrived                   -> LATE
 */
export function stopTiming(plannedArrival: Date | null, actualArrival: Date | null, now: Date = new Date()): StopTiming | null {
  if (!plannedArrival) return null;

  const reference = actualArrival ?? now;
  const diffMinutes = (reference.getTime() - plannedArrival.getTime()) / 60000;

  if (diffMinutes <= 0) return "ON_TIME";
  if (actualArrival) return "LATE";
  if (diffMinutes <= AT_RISK_MINUTES) return "AT_RISK";
  return "LATE";
}
