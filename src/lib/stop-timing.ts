import type { StopTiming } from "./enums";

/** Past this many minutes late with no arrival yet, a stop moves from "at risk" to "late". */
export const AT_RISK_MINUTES = 30;

/** The fields of a TripStop this rule reads. Nothing else about a stop affects its timing. */
export type TimedStop = {
  plannedArrival: Date | null;
  actualArrival: Date | null;
  /** Optional so a caller with only the two arrival fields still type-checks. */
  actualDeparture?: Date | null;
};

/**
 * Deterministic on-time/at-risk/late signal for a trip stop — no GPS, no ETA prediction, just the
 * planned arrival against what actually happened:
 *
 *   settled   = actualArrival ?? actualDeparture ?? null   ("the truck's time here is a fact")
 *   reference = settled ?? now
 *   diff      = reference - plannedArrival, in minutes
 *
 *   no plannedArrival              -> null (insufficient data, render nothing)
 *   diff <= 0                      -> ON_TIME
 *   diff > 0 and settled            -> LATE     (it happened, and it was late)
 *   diff > 0, unsettled, diff <= 30  -> AT_RISK
 *   diff > 30, unsettled             -> LATE
 *
 * ---------------------------------------------------------------------------------------------
 * WHY `actualDeparture` IS A FALLBACK REFERENCE
 * ---------------------------------------------------------------------------------------------
 * `actualArrival` had three readers (this rule's two callers plus the dashboard) and, until the
 * arrival action existed, no writer at all — nothing in the product ever set it. So `settled` was
 * permanently null and every stop was measured against `now`, which does not stop moving.
 *
 * The visible consequence was not "a missing badge". It was a badge that got *worse every day*: a
 * stop the truck left on time last Tuesday still had no recorded arrival, so on Friday the rule
 * measured Tuesday's plan against Friday's clock and reported LATE — and it would report a bigger
 * lateness again on Saturday. Every completed trip in the product drifted into red.
 *
 * A departure is not an arrival, and the difference is deliberately not papered over by writing a
 * fake `actualArrival` into the database at departure time — a stamped column is a claim about
 * when the truck pulled in, and nobody observed that. But a recorded departure IS proof the truck
 * was there no later than that instant, which is exactly the upper bound this comparison needs.
 * So the fact stays out of the table and enters only here, where it is used for what it can
 * honestly support: pinning the clock, so a finished stop stops drifting.
 *
 * With the arrival action in place `actualArrival` is the normal path; the departure fallback
 * covers the stop where the driver simply drove off without pressing it, and every historical row
 * written before either existed.
 */
export function stopTiming(stop: TimedStop, now: Date = new Date()): StopTiming | null {
  if (!stop.plannedArrival) return null;

  const settled = stop.actualArrival ?? stop.actualDeparture ?? null;
  const reference = settled ?? now;
  const diffMinutes = (reference.getTime() - stop.plannedArrival.getTime()) / 60000;

  if (diffMinutes <= 0) return "ON_TIME";
  if (settled) return "LATE";
  if (diffMinutes <= AT_RISK_MINUTES) return "AT_RISK";
  return "LATE";
}
