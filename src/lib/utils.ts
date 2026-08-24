import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * "الرياض ← المكلا". Six screens spelled this out inline with their own arrow character, which is
 * the kind of detail that drifts one file at a time. A string (not a component) because half those
 * screens need it inside a template — a page description, a table cell's title attribute.
 *
 * The arrow points from origin to destination in RTL reading order: origin sits on the right,
 * destination on the left, and `←` runs between them the way the eye already travels.
 */
export function routeLabel(from: string, to: string): string {
  return `${from} ← ${to}`;
}
