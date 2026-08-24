"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

/**
 * "Share tracking" — the customer handing their own link to whoever is waiting for the goods.
 *
 * Rendered only on the token route, and that is a security boundary rather than a layout one: the
 * lookup path never holds a tracking URL, so a share control there would offer an address that
 * grants nothing and opens a page the recipient cannot reach.
 *
 * Sharing the link IS within the product's model — src/lib/tracking.ts already states that a
 * tracking link is a WhatsApp message that gets forwarded to family groups, and that possession of
 * it proves you may *see* the shipment, never that you may redirect it. The two actions that move
 * cartons additionally require the receiver's last four digits, per action, every time.
 *
 * Web Share where the browser has it (the native sheet is what a phone user expects, and it reaches
 * WhatsApp directly), clipboard everywhere else. Both paths end in visible feedback, because a
 * button that appears to do nothing gets pressed again.
 */
export function ShareTracking({ url, shipmentNumber }: { url: string; shipmentNumber: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const data = {
      title: `تتبّع الشحنة ${shipmentNumber}`,
      text: `تابع حالة الشحنة ${shipmentNumber}`,
      url,
    };
    // `canShare` before `share`: Firefox and most desktop browsers expose neither, and calling
    // `share` blindly throws where it is missing.
    if (typeof navigator !== "undefined" && navigator.canShare?.(data)) {
      try {
        await navigator.share(data);
        return;
      } catch {
        // The user dismissed the sheet, or the browser refused. Fall through to the clipboard
        // rather than reporting a failure they caused on purpose.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // No clipboard permission (an insecure origin, usually). Nothing useful to say, and an error
      // toast on a page whose job is reassurance is worse than a button that did not fire.
    }
  }

  return (
    <button type="button" onClick={share} className="track-share" aria-live="polite">
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Share2 className="h-4 w-4" aria-hidden="true" />}
      {copied ? "تم نسخ الرابط" : "مشاركة التتبع"}
    </button>
  );
}
